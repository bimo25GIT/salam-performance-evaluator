import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calculator, Users, Trophy, AlertTriangle } from "lucide-react";
import { EmployeeForm } from "@/components/EmployeeForm";
import { SAWCalculator } from "@/components/SAWCalculator";
import { ResultsDisplay } from "@/components/ResultsDisplay";
import { CriteriaTable } from "@/components/CriteriaTable";
import { CriteriaManagement } from "@/components/CriteriaManagement";
import { EmployeeManagement } from "@/components/EmployeeManagement";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Employee {
  id: string;
  name: string;
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
  [key: string]: any;
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

const Index = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [results, setResults] = useState<SAWResult[]>([]);
  const [totalCriteria, setTotalCriteria] = useState(0);
  const [totalEmployeesInDB, setTotalEmployeesInDB] = useState(0);
  const [loading, setLoading] = useState(true);
  const [criteriaUpdateTrigger, setCriteriaUpdateTrigger] = useState(0);
  const { toast } = useToast();

  // Load saved SAW results automatically
  const loadSavedSAWResults = async () => {
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
          // Create employee object from joined data
          const employee: Employee = {
            id: result.employees.id,
            name: result.employees.name,
            // These values will be loaded separately from evaluation_scores
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
            normalizedScores: [], // Will be loaded by SAWCalculator if needed
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
    }
  };

  // Load data from database using the new flexible structure
  const loadDataFromDatabase = async () => {
    setLoading(true);
    try {
      // Load employees and their evaluation scores using the new flexible structure
      const { data: evaluationScoresData, error: evalError } = await supabase
        .from('evaluation_scores')
        .select(`
          *,
          employees!inner(id, name, position, department),
          criteria!inner(id, name, type, weight, category, scale)
        `);

      if (evalError) {
        console.error('Error fetching evaluation scores:', evalError);
      } else {
        // Convert flexible evaluation scores to Employee format for backward compatibility
        const employeeMap = new Map<string, Employee>();

        (evaluationScoresData || []).forEach(score => {
          const employeeId = score.employee_id;
          
          if (!employeeMap.has(employeeId)) {
            employeeMap.set(employeeId, {
              id: employeeId,
              name: score.employees.name,
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
          switch (score.criteria.name) {
            case 'Kualitas Kerja':
              employee.kualitasKerja = score.score;
              break;
            case 'Tanggung Jawab':
              employee.tanggungJawab = score.score;
              break;
            case 'Kuantitas Kerja':
              employee.kuantitasKerja = score.score;
              break;
            case 'Pemahaman Tugas':
              employee.pemahamanTugas = score.score;
              break;
            case 'Inisiatif':
              employee.inisiatif = score.score;
              break;
            case 'Kerjasama':
              employee.kerjasama = score.score;
              break;
            case 'Jumlah Hari Alpa':
              employee.hariAlpa = score.score;
              break;
            case 'Jumlah Keterlambatan':
              employee.keterlambatan = score.score;
              break;
            case 'Jumlah Hari Izin':
              employee.hariIzin = score.score;
              break;
            case 'Jumlah Hari Sakit':
              employee.hariSakit = score.score;
              break;
            case 'Pulang Cepat':
              employee.pulangCepat = score.score;
              break;
            case 'Prestasi':
              employee.prestasi = score.score;
              break;
            case 'Surat Peringatan':
              employee.suratPeringatan = score.score;
              break;
            // Kriteria baru akan ditambahkan sebagai properti dinamis
            default:
              employee[score.criteria.name] = score.score;
              break;
          }
        });

        const convertedEmployees = Array.from(employeeMap.values());
        setEmployees(convertedEmployees);
        console.log('Loaded employees with flexible evaluation scores:', convertedEmployees.length);
      }

      // Load criteria count
      const { count: criteriaCount, error: criteriaError } = await supabase
        .from('criteria')
        .select('*', { count: 'exact', head: true });

      if (criteriaError) {
        console.error('Error fetching criteria count:', criteriaError);
      } else {
        setTotalCriteria(criteriaCount || 0);
      }

      // Load total employees count
      const { count: employeesCount, error: employeesError } = await supabase
        .from('employees')
        .select('*', { count: 'exact', head: true });

      if (employeesError) {
        console.error('Error fetching employees count:', employeesError);
      } else {
        setTotalEmployeesInDB(employeesCount || 0);
      }

      // Auto-load saved SAW results after loading employee data
      await loadSavedSAWResults();

    } catch (error) {
      console.error('Network error loading data:', error);
      toast({
        title: "Error",
        description: "Gagal memuat data dari database",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCriteriaChange = () => {
    console.log('Criteria changed, triggering reload...');
    setCriteriaUpdateTrigger(prev => prev + 1);
    // Reload data to get updated criteria
    loadDataFromDatabase();
  };

  useEffect(() => {
    loadDataFromDatabase();
  }, []);

  const addEmployee = (employee: Employee) => {
    setEmployees(prev => [...prev, employee]);
  };

  const calculateResults = (sawResults: SAWResult[]) => {
    setResults(sawResults);
  };

  if (loading) {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      <Navbar />
      <div className="container mx-auto p-6">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Sistem Evaluasi Kinerja Karyawan
          </h1>
          <p className="text-xl text-gray-600 mb-4">Yayasan As-Salam</p>
          <div className="flex justify-center gap-2">
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              Metode Simple Additive Weighting (SAW)
            </Badge>
            <Badge variant="outline" className="text-purple-600 border-purple-600">
              Struktur Database Fleksibel
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-white shadow-lg hover:shadow-xl transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Karyawan</p>
                  <p className="text-2xl font-bold text-gray-900">{totalEmployeesInDB}</p>
                  <p className="text-xs text-gray-500">Terevaluasi: {employees.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white shadow-lg hover:shadow-xl transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center">
                <Calculator className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Kriteria</p>
                  <p className="text-2xl font-bold text-gray-900">{totalCriteria}</p>
                  <p className="text-xs text-gray-500">Fleksibel</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg hover:shadow-xl transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center">
                <Trophy className="h-8 w-8 text-yellow-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Terhitung</p>
                  <p className="text-2xl font-bold text-gray-900">{results.length}</p>
                  <p className="text-xs text-gray-500">Hasil SAW</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg hover:shadow-xl transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center">
                <AlertTriangle className="h-8 w-8 text-red-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Perlu Perhatian</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {results.filter(r => r.convertedScore < 3).length}
                  </p>
                  <p className="text-xs text-gray-500">Skor &lt; 3</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="criteria" className="w-full">
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
            <EmployeeManagement />
          </TabsContent>

          <TabsContent value="input">
            <EmployeeForm 
              onAddEmployee={addEmployee} 
              employees={employees}
              criteriaUpdateTrigger={criteriaUpdateTrigger}
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