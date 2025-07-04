import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calculator, Users, Trophy, AlertTriangle, RefreshCw } from "lucide-react";
import { EmployeeForm } from "@/components/EmployeeForm";
import { SAWCalculator } from "@/components/SAWCalculator";
import { ResultsDisplay } from "@/components/ResultsDisplay";
import { CriteriaTable } from "@/components/CriteriaTable";
import { CriteriaManagement } from "@/components/CriteriaManagement";
import { EmployeeManagement } from "@/components/EmployeeManagement";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Enhanced Employee interface with better typing
export interface Employee {
  id: string;
  name: string;
  position?: string;
  department?: string;
  // Core evaluation criteria
  kualitasKerja: number;
  tanggungJawab: number;
  kuantitasKerja: number;
  pemahamanTugas: number;
  inisiatif: number;
  kerjasama: number;
  hariAlpa: number;
  keterlambatan: number;
  hariIzin: number;
  hariSakit: number;
  pulangCepat: number;
  prestasi: number;
  suratPeringatan: number;
  // Dynamic properties for new criteria
  [key: string]: number | string | undefined;
}

export interface SAWResult {
  employee: Employee;
  normalizedScores: number[];
  finalScore: number;
  convertedScore: number;
  rank: number;
  recommendation: string;
  note?: string;
}

interface StatisticsData {
  totalEmployees: number;
  evaluatedEmployees: number;
  totalCriteria: number;
  calculatedResults: number;
  needsAttention: number;
}

interface LoadingState {
  data: boolean;
  sawResults: boolean;
  statistics: boolean;
}

// Custom hook for managing employee data
const useEmployeeData = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: evaluationScoresData, error: evalError } = await supabase
        .from('evaluation_scores')
        .select(`
          *,
          employees!inner(id, name, position, department),
          criteria!inner(id, name, type, weight, category, scale)
        `);

      if (evalError) {
        throw new Error(`Failed to load evaluation scores: ${evalError.message}`);
      }

      const employeeMap = new Map<string, Employee>();

      (evaluationScoresData || []).forEach(score => {
        const employeeId = score.employee_id;
        
        if (!employeeMap.has(employeeId)) {
          employeeMap.set(employeeId, {
            id: employeeId,
            name: score.employees.name,
            position: score.employees.position,
            department: score.employees.department,
            // Initialize with default values
            kualitasKerja: 1,
            tanggungJawab: 1,
            kuantitasKerja: 1,
            pemahamanTugas: 1,
            inisiatif: 1,
            kerjasama: 1,
            hariAlpa: 0,
            keterlambatan: 0,
            hariIzin: 0,
            hariSakit: 0,
            pulangCepat: 0,
            prestasi: 0,
            suratPeringatan: 0
          });
        }

        const employee = employeeMap.get(employeeId)!;
        
        // Map criteria to employee fields (for backward compatibility)
        const criteriaName = score.criteria.name;
        const criteriaMapping: Record<string, keyof Employee> = {
          'Kualitas Kerja': 'kualitasKerja',
          'Tanggung Jawab': 'tanggungJawab',
          'Kuantitas Kerja': 'kuantitasKerja',
          'Pemahaman Tugas': 'pemahamanTugas',
          'Inisiatif': 'inisiatif',
          'Kerjasama': 'kerjasama',
          'Jumlah Hari Alpa': 'hariAlpa',
          'Jumlah Keterlambatan': 'keterlambatan',
          'Jumlah Hari Izin': 'hariIzin',
          'Jumlah Hari Sakit': 'hariSakit',
          'Pulang Cepat': 'pulangCepat',
          'Prestasi': 'prestasi',
          'Surat Peringatan': 'suratPeringatan'
        };

        if (criteriaMapping[criteriaName]) {
          employee[criteriaMapping[criteriaName]] = score.score;
        } else if (typeof criteriaName === 'string' && criteriaName) {
          // Dynamic criteria
          employee[criteriaName] = score.score;
        }
      });

      const convertedEmployees = Array.from(employeeMap.values());
      setEmployees(convertedEmployees);
      
      console.log('Loaded employees with evaluation scores:', convertedEmployees.length);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Error loading employees:', err);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const addEmployee = useCallback((employee: Employee) => {
    setEmployees(prev => [...prev, employee]);
    // Trigger reload after a short delay to ensure consistency
    setTimeout(() => {
      loadEmployees();
    }, 500);
  }, [loadEmployees]);

  return { employees, loading, error, loadEmployees, addEmployee };
};

// Custom hook for managing statistics
const useStatistics = (employees: Employee[], results: SAWResult[]) => {
  const [stats, setStats] = useState<StatisticsData>({
    totalEmployees: 0,
    evaluatedEmployees: 0,
    totalCriteria: 0,
    calculatedResults: 0,
    needsAttention: 0
  });
  const [loading, setLoading] = useState(true);

  const loadStatistics = useCallback(async () => {
    setLoading(true);
    
    try {
      const [criteriaResult, employeesResult] = await Promise.all([
        supabase.from('criteria').select('*', { count: 'exact', head: true }),
        supabase.from('employees').select('*', { count: 'exact', head: true })
      ]);

      setStats({
        totalEmployees: employeesResult.count || 0,
        evaluatedEmployees: employees.length,
        totalCriteria: criteriaResult.count || 0,
        calculatedResults: results.length,
        needsAttention: results.filter(r => r.convertedScore < 3).length
      });
    } catch (error) {
      console.error('Error loading statistics:', error);
    } finally {
      setLoading(false);
    }
  }, [employees.length, results]);

  useEffect(() => {
    loadStatistics();
  }, [loadStatistics]);

  return { stats, loading: loading, refresh: loadStatistics };
};

// Custom hook for managing SAW results
const useSAWResults = () => {
  const [results, setResults] = useState<SAWResult[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadSavedResults = useCallback(async () => {
    setLoading(true);
    
    try {
      console.log('Checking for saved SAW results...');
      
      // Get the latest calculation date
      const { data: latestCalc, error: calcError } = await supabase
        .from('saw_results')
        .select('calculation_date')
        .order('calculation_date', { ascending: false })
        .limit(1);

      if (calcError || !latestCalc || latestCalc.length === 0) {
        console.log('No saved SAW results found');
        return;
      }

      const calculationDate = latestCalc[0].calculation_date;
      console.log('Found saved SAW results from:', calculationDate);

      // Load SAW results with employee data
      const { data: savedResults, error: resultsError } = await supabase
        .from('saw_results')
        .select(`
          *,
          employees!inner(id, name, position, department)
        `)
        .eq('calculation_date', calculationDate)
        .order('rank');

      if (resultsError) {
        console.error('Error loading saved SAW results:', resultsError);
        return;
      }

      if (savedResults && savedResults.length > 0) {
        // Convert database results to SAWResult format
        const convertedResults: SAWResult[] = savedResults.map(result => {
          const employee: Employee = {
            id: result.employees.id,
            name: result.employees.name,
            position: result.employees.position,
            department: result.employees.department,
            // Initialize with default values - will be loaded separately
            kualitasKerja: 0,
            tanggungJawab: 0,
            kuantitasKerja: 0,
            pemahamanTugas: 0,
            inisiatif: 0,
            kerjasama: 0,
            hariAlpa: 0,
            keterlambatan: 0,
            hariIzin: 0,
            hariSakit: 0,
            pulangCepat: 0,
            prestasi: 0,
            suratPeringatan: 0
          };

          return {
            employee,
            normalizedScores: [],
            finalScore: result.final_score,
            convertedScore: result.converted_score,
            rank: result.rank,
            recommendation: result.recommendation,
            note: result.note || undefined
          };
        });

        console.log('Auto-loaded saved SAW results:', convertedResults.length);
        setResults(convertedResults);
        
        toast({
          title: "Info",
          description: `Otomatis memuat ${convertedResults.length} hasil perhitungan SAW tersimpan`,
        });
      }
    } catch (error) {
      console.error('Error auto-loading saved SAW results:', error);
      toast({
        title: "Error",
        description: "Gagal memuat hasil SAW tersimpan",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const calculateResults = useCallback((sawResults: SAWResult[]) => {
    setResults(sawResults);
  }, []);

  return { results, loading, loadSavedResults, calculateResults };
};

// Statistics Card Component
const StatisticsCard = ({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  color, 
  loading 
}: {
  title: string;
  value: number;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  loading: boolean;
}) => (
  <Card className="bg-white shadow-lg hover:shadow-xl transition-shadow">
    <CardContent className="p-6">
      <div className="flex items-center">
        <Icon className={`h-8 w-8 ${color}`} />
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          {loading ? (
            <div className="h-8 w-16 bg-gray-200 animate-pulse rounded"></div>
          ) : (
            <p className="text-2xl font-bold text-gray-900">{value}</p>
          )}
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
    </CardContent>
  </Card>
);

// Main component
const Index = () => {
  const [criteriaUpdateTrigger, setCriteriaUpdateTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState("criteria");
  
  const { employees, loading: employeesLoading, error: employeesError, loadEmployees, addEmployee } = useEmployeeData();
  const { results, loading: resultsLoading, loadSavedResults, calculateResults } = useSAWResults();
  const { stats, loading: statsLoading, refresh: refreshStats } = useStatistics(employees, results);

  // Load data on component mount
  useEffect(() => {
    const initializeData = async () => {
      await loadEmployees();
      await loadSavedResults();
    };

    initializeData();
  }, [loadEmployees, loadSavedResults]);

  const handleCriteriaChange = useCallback(() => {
    console.log('Criteria changed, triggering reload...');
    setCriteriaUpdateTrigger(prev => prev + 1);
    loadEmployees();
    refreshStats();
  }, [loadEmployees, refreshStats]);

  const handleEmployeeUpdate = useCallback(() => {
    console.log('Employee data updated, refreshing...');
    loadEmployees();
    refreshStats();
  }, [loadEmployees, refreshStats]);

  const handleRefresh = useCallback(() => {
    loadEmployees();
    loadSavedResults();
    refreshStats();
  }, [loadEmployees, loadSavedResults, refreshStats]);

  // Memoized statistics cards
  const statisticsCards = useMemo(() => [
    {
      title: "Total Karyawan",
      value: stats.totalEmployees,
      subtitle: `Terevaluasi: ${stats.evaluatedEmployees}`,
      icon: Users,
      color: "text-blue-600"
    },
    {
      title: "Kriteria",
      value: stats.totalCriteria,
      subtitle: "Fleksibel",
      icon: Calculator,
      color: "text-green-600"
    },
    {
      title: "Terhitung",
      value: stats.calculatedResults,
      subtitle: "Hasil SAW",
      icon: Trophy,
      color: "text-yellow-600"
    },
    {
      title: "Perlu Perhatian",
      value: stats.needsAttention,
      subtitle: "Skor < 3",
      icon: AlertTriangle,
      color: "text-red-600"
    }
  ], [stats]);

  // Loading state
  if (employeesLoading && employees.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
        <Navbar />
        <div className="container mx-auto p-6">
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Memuat data dari database...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (employeesError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
        <Navbar />
        <div className="container mx-auto p-6">
          <div className="text-center py-20">
            <AlertTriangle className="h-12 w-12 text-red-600 mx-auto mb-4" />
            <p className="text-red-600 mb-4">Error: {employeesError}</p>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Coba Lagi
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      <Navbar />
      <div className="container mx-auto p-6">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Sistem Evaluasi Kinerja Karyawan
          </h1>
          <p className="text-xl text-gray-600 mb-4">Yayasan As-Salam Joglo</p>
          <div className="flex justify-center gap-2 items-center">
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              Metode Simple Additive Weighting (SAW)
            </Badge>
            <Button 
              onClick={handleRefresh} 
              variant="ghost" 
              size="sm"
              disabled={employeesLoading || resultsLoading}
            >
              <RefreshCw className={`h-4 w-4 ${employeesLoading || resultsLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {statisticsCards.map((card, index) => (
            <StatisticsCard
              key={index}
              title={card.title}
              value={card.value}
              subtitle={card.subtitle}
              icon={card.icon}
              color={card.color}
              loading={statsLoading}
            />
          ))}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-6 mb-6">
            <TabsTrigger value="criteria">Kriteria & Bobot</TabsTrigger>
            <TabsTrigger value="criteria-crud">Kelola Kriteria</TabsTrigger>
            <TabsTrigger value="employees">Kelola Karyawan</TabsTrigger>
            <TabsTrigger value="input">Input Data</TabsTrigger>
            <TabsTrigger value="calculate">Perhitungan SAW</TabsTrigger>
            <TabsTrigger value="results">Hasil & Rekomendasi</TabsTrigger>
          </TabsList>

          <TabsContent value="criteria">
            <CriteriaTable key={criteriaUpdateTrigger} />
          </TabsContent>

          <TabsContent value="criteria-crud">
            <CriteriaManagement onCriteriaChange={handleCriteriaChange} />
          </TabsContent>

          <TabsContent value="employees">
            <EmployeeManagement onEmployeeUpdate={handleEmployeeUpdate} />
          </TabsContent>

          <TabsContent value="input">
            <EmployeeForm 
              onAddEmployee={addEmployee} 
              employees={employees}
              criteriaUpdateTrigger={criteriaUpdateTrigger}
              onEmployeeUpdate={handleEmployeeUpdate}
            />
          </TabsContent>

          <TabsContent value="calculate">
            <SAWCalculator 
              employees={employees} 
              onCalculate={calculateResults}
              criteriaUpdateTrigger={criteriaUpdateTrigger}
            />
          </TabsContent>

          <TabsContent value="results">
            <ResultsDisplay results={results} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;