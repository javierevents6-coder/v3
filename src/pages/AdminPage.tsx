import { useState, useEffect } from 'react';
import CalendarSetupInstructions from '../components/ui/CalendarSetupInstructions';
import GoogleCalendarConnect from '../components/ui/GoogleCalendarConnect';
import { useFeatureFlags } from '../contexts/FeatureFlagsContext';
import { db } from '../utils/firebaseClient';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Calendar,
  Filter,
  Plus
} from 'lucide-react';

const AdminPage = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendar' | 'visibility'>('dashboard');
  const { flags, setPageEnabled } = useFeatureFlags();
  const [dateRange, setDateRange] = useState('month');
  const [financialData, setFinancialData] = useState({
    totalIncome: 0,
    totalExpenses: 0,
    netProfit: 0,
    reinvestmentAmount: 0,
    investments: []
  });
  const [monthlyData, setMonthlyData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Get date range
      const today = new Date();
      let startDate = new Date();
      if (dateRange === 'month') {
        startDate.setMonth(today.getMonth() - 1);
      } else if (dateRange === 'year') {
        startDate.setFullYear(today.getFullYear() - 1);
      } else {
        startDate.setDate(today.getDate() - 7);
      }

      // Fetch transactions
      const txCol = collection(db, 'transactions');
      let txQ: any = txCol;
      try { txQ = query(txCol, where('date', '>=', startDate.toISOString()), orderBy('date', 'asc')); } catch (_) { txQ = txCol; }
      const txSnap = await getDocs(txQ);
      const transactions: any[] = txSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

      // Fetch investments
      const invCol = collection(db, 'investments');
      let invQ: any = invCol;
      try { invQ = query(invCol, orderBy('date', 'desc')); } catch (_) { invQ = invCol; }
      const invSnap = await getDocs(invQ);
      const investments: any[] = invSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

      // Fetch upcoming events
      const evCol = collection(db, 'contracts');
      let evQ: any = evCol;
      try { evQ = query(evCol, where('event_date', '>', today.toISOString()), orderBy('event_date', 'asc')); } catch (_) { evQ = evCol; }
      const evSnap = await getDocs(evQ);
      const events: any[] = evSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

      // Process financial data
      const income = transactions.filter(t => (t.type || '').toLowerCase() === 'income')
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const expenses = transactions.filter(t => (t.type || '').toLowerCase() === 'expense')
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const netProfit = income - expenses;
      const reinvestmentAmount = netProfit * 0.2;

      // Process monthly data
      const monthlyStats = processMonthlyData(transactions);
      // Process category data
      const categoryStats = processCategoryData(transactions);

      setFinancialData({
        totalIncome: income,
        totalExpenses: expenses,
        netProfit,
        reinvestmentAmount,
        investments
      });
      setMonthlyData(monthlyStats as any);
      setCategoryData(categoryStats as any);
      setUpcomingEvents(events);
      
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const processMonthlyData = (transactions: any[]) => {
    const monthlyData = {};
    
    transactions?.forEach(transaction => {
      const date = new Date(transaction.date);
      const monthYear = date.toLocaleString('default', { month: 'short', year: 'numeric' });
      
      if (!monthlyData[monthYear]) {
        monthlyData[monthYear] = { month: monthYear, income: 0, expenses: 0 };
      }
      
      if (transaction.categories.type === 'income') {
        monthlyData[monthYear].income += Number(transaction.amount);
      } else if (transaction.categories.type === 'expense') {
        monthlyData[monthYear].expenses += Number(transaction.amount);
      }
    });
    
    return Object.values(monthlyData);
  };

  const processCategoryData = (transactions: any[]) => {
    const categoryData = {};
    
    transactions?.forEach(transaction => {
      const category = transaction.categories.name;
      
      if (!categoryData[category]) {
        categoryData[category] = { name: category, value: 0 };
      }
      
      categoryData[category].value += Number(transaction.amount);
    });
    
    return Object.values(categoryData);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Financial Dashboard</h1>
          
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-2 rounded-lg ${activeTab === 'dashboard' ? 'bg-primary text-white' : 'bg-white text-primary border border-primary'}`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('calendar')}
                className={`px-4 py-2 rounded-lg ${activeTab === 'calendar' ? 'bg-primary text-white' : 'bg-white text-primary border border-primary'}`}
              >
                Calendário
              </button>
              <button
                onClick={() => setActiveTab('visibility')}
                className={`px-4 py-2 rounded-lg ${activeTab === 'visibility' ? 'bg-primary text-white' : 'bg-white text-primary border border-primary'}`}
              >
                Visibilidad
              </button>
            </div>
            
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-white border rounded-lg px-4 py-2"
            >
              <option value="week">Last Week</option>
              <option value="month">Last Month</option>
              <option value="year">Last Year</option>
            </select>
            
            <button
              onClick={() => {/* Add transaction modal */}}
              className="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <Plus size={20} />
              Add Transaction
            </button>
          </div>
        </div>

        {activeTab === 'calendar' && (
          <div className="mb-8 space-y-6">
            <GoogleCalendarConnect />
            <CalendarSetupInstructions />
          </div>
        )}

        {activeTab === 'visibility' && (
          <div className="bg-white p-6 rounded-lg shadow mb-8">
            <h2 className="text-xl font-bold mb-4">Visibilidad de Páginas</h2>
            <p className="text-gray-600 mb-4">Habilita o deshabilita secciones del sitio para publicar solo lo que está listo.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(flags.pages).map(([key, value]) => (
                <label key={key} className="flex items-center gap-3 border rounded-lg p-3">
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(e) => setPageEnabled(key as any, e.target.checked)}
                  />
                  <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').replace(/\s+/g, ' ').trim()}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-4">Los cambios se guardan automáticamente. Se sincronizan en Firestore (config/featureFlags) con respaldo local.</p>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <>
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Income</p>
                <p className="text-2xl font-bold text-green-600">
                  ${financialData.totalIncome.toLocaleString()}
                </p>
              </div>
              <div className="bg-green-100 p-3 rounded-full">
                <TrendingUp className="text-green-600" size={24} />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Total Expenses</p>
                <p className="text-2xl font-bold text-red-600">
                  ${financialData.totalExpenses.toLocaleString()}
                </p>
              </div>
              <div className="bg-red-100 p-3 rounded-full">
                <TrendingDown className="text-red-600" size={24} />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">Net Profit</p>
                <p className="text-2xl font-bold text-primary">
                  ${financialData.netProfit.toLocaleString()}
                </p>
              </div>
              <div className="bg-primary/10 p-3 rounded-full">
                <DollarSign className="text-primary" size={24} />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500 text-sm">For Reinvestment (20%)</p>
                <p className="text-2xl font-bold text-secondary">
                  ${financialData.reinvestmentAmount.toLocaleString()}
                </p>
              </div>
              <div className="bg-secondary/10 p-3 rounded-full">
                <PiggyBank className="text-secondary" size={24} />
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Income vs Expenses</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="income" fill="#10B981" name="Income" />
                <Bar dataKey="expenses" fill="#EF4444" name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">Expenses by Category</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                >
                  {categoryData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`}
                      fill={[
                        '#10B981',
                        '#3B82F6',
                        '#6366F1',
                        '#8B5CF6',
                        '#EC4899',
                        '#EF4444',
                        '#F59E0B',
                        '#10B981'
                      ][index % 8]}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Investments & Upcoming Events */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Recent Investments</h2>
              <button className="text-primary hover:text-primary/80">
                View All
              </button>
            </div>
            <div className="space-y-4">
              {financialData.investments.slice(0, 5).map((investment) => (
                <div key={investment.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{investment.description}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(investment.date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">${investment.amount.toLocaleString()}</p>
                    <p className={`text-sm ${
                      investment.status === 'completed' ? 'text-green-600' :
                      investment.status === 'in_progress' ? 'text-blue-600' :
                      'text-gray-600'
                    }`}>
                      {investment.status.replace('_', ' ')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Upcoming Events</h2>
              <button className="text-primary hover:text-primary/80">
                View All
              </button>
            </div>
            <div className="space-y-4">
              {upcomingEvents.map((event) => (
                <div key={event.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{event.client_name}</p>
                    <p className="text-sm text-gray-500">{event.event_type}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      ${Number(event.total_amount).toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(event.event_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminPage;
