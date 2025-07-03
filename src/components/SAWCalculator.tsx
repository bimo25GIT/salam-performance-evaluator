import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calculator, Play, RefreshCw, AlertTriangle, Database, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Employee, SAWResult } from "@/pages/Index";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Criteria {
  id: string;
  name: string;
  type: 'Benefit' | 'Cost';
  weight: number;
  category: string;
  scale: string;
}

interface SAWCalculatorProps {
  employees: Employee[];
  onCalculate: (results: SAWResult[]) => void;
  criteriaUpdateTrigger?: number;
}

// Konstanta untuk urutan kategori
const CATEGORY_ORDER = [
  'A. Kinerja Inti',
  'B. Kedisiplinan', 
  'C. Faktor Tambahan'
];

// Konstanta untuk urutan kriteria kanonis dalam setiap kategori
const CANONICAL_CRITERIA_ORDER = {
  'A. Kinerja Inti': [
    'Kualitas Kerja',
    'Tanggung Jawab', 
    'Kuantitas Kerja',
    'Pemahaman Tugas',
    'Inisiatif',
    'Kerjasama'
  ],
  'B. Kedisiplinan': [
    'Jumlah Hari Alpa',
    'Jumlah Keterlambatan',
    'Jumlah Hari Izin',
    'Jumlah Hari Sakit',
    'Pulang Cepat'
  ],
  'C. Faktor Tambahan': [
    'Prestasi',
    'Surat Peringatan'
  ]
};

export const SAWCalculator = ({ employees, onCalculate, criteriaUpdateTrigger }: SAWCalculatorProps) => {
  const [criteriaWeights, setCriteriaWeights] = useState<{ [key: string]: number }>({});
  const [criteriaTypes, setCriteriaTypes] = useState<{ [key: string]: string }>({});
  const [criteriaData, setCriteriaData] = useState<Criteria[]>([]);
  const [decisionMatrix, setDecisionMatrix] = useState<number[][]>([]);
  const [normalizedMatrix, setNormalizedMatrix] = useState<number[][]>([]);
  const [finalScores, setFinalScores] = useState<SAWResult[]>([]);
  const [isCalculated, setIsCalculated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasSavedResults, setHasSavedResults] = useState(false);
  const [lastCalculationDate, setLastCalculationDate] = useState<string>('');
  const { toast } = useToast();

  // Fungsi untuk mengurutkan kriteria berdasarkan kategori dan urutan kanonis
  const sortCriteria = (criteria: Criteria[]): Criteria[] => {
    return criteria.sort((a, b) => {
      // Pertama, urutkan berdasarkan kategori
      const categoryIndexA = CATEGORY_ORDER.indexOf(a.category);
      const categoryIndexB = CATEGORY_ORDER.indexOf(b.category);
      
      // Jika kategori berbeda, urutkan berdasarkan urutan kategori
      if (categoryIndexA !== categoryIndexB) {
        // Kategori yang tidak ada dalam CATEGORY_ORDER akan diletakkan di akhir
        if (categoryIndexA === -1) return 1;
        if (categoryIndexB === -1) return -1;
        return categoryIndexA - categoryIndexB;
      }
      
      // Jika kategori sama, urutkan berdasarkan urutan kriteria kanonis
      const canonicalOrder = CANONICAL_CRITERIA_ORDER[a.category as keyof typeof CANONICAL_CRITERIA_ORDER];
      if (canonicalOrder) {
        const indexA = canonicalOrder.indexOf(a.name);
        const indexB = canonicalOrder.indexOf(b.name);
        
        // Jika kedua kriteria ada dalam urutan kanonis
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }
        
        // Jika hanya satu yang ada dalam urutan kanonis
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
      }
      
      // Jika tidak ada dalam urutan kanonis, urutkan berdasarkan nama
      return a.name.localeCompare(b.name);
    });
  };

  // Fungsi untuk mengkonversi nama kriteria menjadi field name yang konsisten
  const createFieldName = (criteriaName: string): string => {
    return criteriaName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Hapus karakter khusus
      .replace(/\s+/g, '_') // Ganti spasi dengan underscore
      .replace(/^_+|_+$/g, '') // Hapus underscore di awal/akhir
      .replace(/_+/g, '_'); // Ganti multiple underscore dengan single
  };

  // Mapping dinamis dari nama kriteria ke field Employee interface
  const createEmployeeFieldMapping = (criteriaName: string): string => {
    const fieldName = createFieldName(criteriaName);
    
    // Mapping khusus untuk kriteria yang sudah ada di Employee interface
    const specialMappings: { [key: string]: string } = {
      'kualitas_kerja': 'kualitasKerja',
      'tanggung_jawab': 'tanggungJawab',
      'kuantitas_kerja': 'kuantitasKerja',
      'pemahaman_tugas': 'pemahamanTugas',
      'inisiatif': 'inisiatif',
      'kerjasama': 'kerjasama',
      'jumlah_hari_alpa': 'hariAlpa',
      'jumlah_keterlambatan': 'keterlambatan',
      'jumlah_hari_izin': 'hariIzin',
      'jumlah_hari_sakit': 'hariSakit',
      'pulang_cepat': 'pulangCepat',
      'prestasi': 'prestasi',
      'surat_peringatan': 'suratPeringatan'
    };

    return specialMappings[fieldName] || fieldName;
  };

  // Mapping untuk kode kriteria C1-C13+ dengan urutan yang benar
  const criteriaCodeMapping: { [key: string]: string } = {};

  // Check if there are saved SAW results in database
  const checkSavedResults = async () => {
    try {
      const { data, error } = await supabase
        .from('saw_results')
        .select('calculation_date')
        .order('calculation_date', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error checking saved results:', error);
        return;
      }

      if (data && data.length > 0) {
        setHasSavedResults(true);
        setLastCalculationDate(new Date(data[0].calculation_date).toLocaleString('id-ID'));
        console.log('Found saved SAW results from:', data[0].calculation_date);
      } else {
        setHasSavedResults(false);
        console.log('No saved SAW results found');
      }
    } catch (error) {
      console.error('Error checking saved results:', error);
    }
  };

  // Load saved SAW results from database
  const loadSavedResults = async () => {
    if (employees.length === 0) {
      toast({
        title: "Error",
        description: "Tidak ada data karyawan untuk dimuat",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      console.log('Loading saved SAW results from database...');

      // Get the latest calculation date
      const { data: latestCalc, error: calcError } = await supabase
        .from('saw_results')
        .select('calculation_date')
        .order('calculation_date', { ascending: false })
        .limit(1);

      if (calcError || !latestCalc || latestCalc.length === 0) {
        toast({
          title: "Error",
          description: "Tidak ada hasil perhitungan tersimpan",
          variant: "destructive",
        });
        return;
      }

      const calculationDate = latestCalc[0].calculation_date;

      // Load SAW results
      const { data: savedResults, error: resultsError } = await supabase
        .from('saw_results')
        .select(`
          *,
          employees!inner(id, name, position, department)
        `)
        .eq('calculation_date', calculationDate)
        .order('rank');

      // Load normalized matrix data
      const { data: normalizedData, error: normalizedError } = await supabase
        .from('saw_normalized_matrix')
        .select('*')
        .eq('calculation_date', calculationDate)
        .order('employee_id');

      if (resultsError || normalizedError) {
        console.error('Error loading saved data:', resultsError || normalizedError);
        toast({
          title: "Error",
          description: "Gagal memuat data hasil perhitungan",
          variant: "destructive",
        });
        return;
      }

      // Convert database results to SAWResult format
      const convertedResults: SAWResult[] = (savedResults || []).map(result => {
        // Find employee from current employees list
        const employee = employees.find(emp => emp.id === result.employee_id);
        if (!employee) {
          console.warn(`Employee not found for ID: ${result.employee_id}`);
          return null;
        }

        // Get normalized scores for this employee
        const employeeNormalizedData = (normalizedData || [])
          .filter(norm => norm.employee_id === result.employee_id)
          .sort((a, b) => a.criteria_code.localeCompare(b.criteria_code));

        return {
          employee,
          normalizedScores: employeeNormalizedData.map(norm => norm.normalized_value),
          finalScore: result.final_score,
          convertedScore: result.converted_score,
          rank: result.rank,
          recommendation: result.recommendation,
          note: result.note || undefined
        };
      }).filter(Boolean) as SAWResult[];

      console.log('Loaded saved results:', convertedResults.length);
      
      setFinalScores(convertedResults);
      setIsCalculated(true);
      onCalculate(convertedResults);

      toast({
        title: "Berhasil",
        description: `Berhasil memuat ${convertedResults.length} hasil perhitungan tersimpan`,
      });
    } catch (error) {
      console.error('Error loading saved results:', error);
      toast({
        title: "Error",
        description: "Terjadi kesalahan saat memuat data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Save SAW results to database
  const saveResultsToDatabase = async (results: SAWResult[], normalizedMatrix: number[][]) => {
    try {
      console.log('Saving SAW results to database...');
      
      const calculationDate = new Date().toISOString();
      const activeCriteria = criteriaData.filter(criterion => criteriaWeights[createFieldName(criterion.name)] !== undefined);

      // 1. Save calculation session
      const { error: calcSessionError } = await supabase
        .from('saw_calculations')
        .insert({
          total_employees: results.length,
          total_criteria: activeCriteria.length,
          calculation_date: calculationDate
        });

      if (calcSessionError) {
        console.error('Error saving calculation session:', calcSessionError);
        throw calcSessionError;
      }

      // 2. Save SAW results
      const resultsToInsert = results.map(result => ({
        employee_id: result.employee.id,
        final_score: result.finalScore,
        converted_score: result.convertedScore,
        rank: result.rank,
        recommendation: result.recommendation,
        note: result.note || null,
        calculation_date: calculationDate
      }));

      const { error: resultsError } = await supabase
        .from('saw_results')
        .insert(resultsToInsert);

      if (resultsError) {
        console.error('Error saving SAW results:', resultsError);
        throw resultsError;
      }

      // 3. Save normalized matrix data
      const matrixDataToInsert: any[] = [];
      
      results.forEach((result, empIndex) => {
        result.normalizedScores.forEach((normalizedValue, criteriaIndex) => {
          const criterion = activeCriteria[criteriaIndex];
          const criteriaCode = `C${criteriaIndex + 1}`;
          const employeeFieldName = createEmployeeFieldMapping(criterion.name);
          const rawValue = (result.employee as any)[employeeFieldName] || 0;
          
          matrixDataToInsert.push({
            employee_id: result.employee.id,
            criteria_code: criteriaCode,
            raw_value: rawValue,
            normalized_value: normalizedValue,
            weight: criteriaWeights[createFieldName(criterion.name)],
            calculation_date: calculationDate
          });
        });
      });

      const { error: matrixError } = await supabase
        .from('saw_normalized_matrix')
        .insert(matrixDataToInsert);

      if (matrixError) {
        console.error('Error saving normalized matrix:', matrixError);
        throw matrixError;
      }

      console.log('Successfully saved SAW results to database');
      setHasSavedResults(true);
      setLastCalculationDate(new Date(calculationDate).toLocaleString('id-ID'));

      toast({
        title: "Berhasil",
        description: "Hasil perhitungan SAW berhasil disimpan ke database",
      });
    } catch (error) {
      console.error('Error saving to database:', error);
      toast({
        title: "Error",
        description: "Gagal menyimpan hasil ke database",
        variant: "destructive",
      });
    }
  };

  // Clear saved results from database
  const clearSavedResults = async () => {
    setLoading(true);
    try {
      console.log('Clearing saved SAW results...');

      // Delete in order: normalized matrix, results, calculations
      await supabase.from('saw_normalized_matrix').delete().neq('id', '');
      await supabase.from('saw_results').delete().neq('id', '');
      await supabase.from('saw_calculations').delete().neq('id', '');

      setHasSavedResults(false);
      setLastCalculationDate('');
      setFinalScores([]);
      setIsCalculated(false);
      onCalculate([]);

      toast({
        title: "Berhasil",
        description: "Semua hasil perhitungan tersimpan telah dihapus",
      });
    } catch (error) {
      console.error('Error clearing saved results:', error);
      toast({
        title: "Error",
        description: "Gagal menghapus hasil tersimpan",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCriteriaWeights = async () => {
    setLoading(true);
    try {
      console.log('Fetching criteria from Supabase...');
      
      const { data, error } = await supabase
        .from('criteria')
        .select('*')
        .order('name');

      if (error) {
        console.error('Supabase error:', error);
        throw new Error(`Database error: ${error.message}`);
      }

      if (!data || data.length === 0) {
        console.warn('No criteria found in database');
        toast({
          title: "Peringatan",
          description: "Tidak ada kriteria ditemukan di database. Silakan tambahkan kriteria terlebih dahulu.",
          variant: "destructive",
        });
        return;
      }

      console.log('Raw criteria data from Supabase:', data);

      // Convert to Criteria format and sort
      const rawCriteria: Criteria[] = data.map(item => ({
        id: item.id,
        name: item.name,
        type: item.type as 'Benefit' | 'Cost',
        weight: item.weight,
        category: item.category,
        scale: item.scale
      }));

      // Sort criteria using the new sorting function
      const sortedCriteria = sortCriteria(rawCriteria);

      const weights: { [key: string]: number } = {};
      const types: { [key: string]: string } = {};

      sortedCriteria.forEach((criteria, index) => {
        const fieldName = createFieldName(criteria.name);
        weights[fieldName] = criteria.weight / 100;
        types[fieldName] = criteria.type;
        
        // Generate criteria code mapping berdasarkan urutan yang sudah disortir
        criteriaCodeMapping[fieldName] = `C${index + 1}`;
        
        console.log(`Mapped ${criteria.name} -> ${fieldName} (${criteriaCodeMapping[fieldName]}) - Category: ${criteria.category}`);
      });

      setCriteriaWeights(weights);
      setCriteriaTypes(types);
      setCriteriaData(sortedCriteria); // Simpan data yang sudah diurutkan

      console.log('Processed criteria weights:', weights);
      console.log('Processed criteria types:', types);
      console.log('Total criteria loaded and sorted:', sortedCriteria.length);
      console.log('Sorted criteria order:', sortedCriteria.map(c => `${c.category}: ${c.name}`));

      toast({
        title: "Berhasil",
        description: `Data ${sortedCriteria.length} kriteria berhasil dimuat dan diurutkan berdasarkan kategori dari database.`,
      });
    } catch (error) {
      console.error('Error fetching criteria:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Gagal memuat data kriteria dari database",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCriteriaWeights();
    checkSavedResults();
  }, []);

  // Auto-refresh when criteria change
  useEffect(() => {
    if (criteriaUpdateTrigger !== undefined && criteriaUpdateTrigger > 0) {
      console.log('Criteria update trigger detected, refreshing...');
      fetchCriteriaWeights();
    }
  }, [criteriaUpdateTrigger]);

  const calculateSAW = async () => {
    if (employees.length === 0) {
      toast({
        title: "Error",
        description: "Tidak ada data karyawan untuk dihitung",
        variant: "destructive",
      });
      return;
    }

    if (Object.keys(criteriaWeights).length === 0) {
      toast({
        title: "Error",
        description: "Data kriteria belum dimuat dari database. Klik 'Muat Ulang Kriteria' terlebih dahulu.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    console.log("Starting SAW calculation for employees:", employees.length);
    console.log("Using criteria weights (decimals):", criteriaWeights);

    try {
      // Gunakan criteriaData yang sudah diurutkan
      const activeCriteria = criteriaData.filter(criterion => criteriaWeights[createFieldName(criterion.name)] !== undefined);
      
      console.log("Active criteria for calculation (sorted):", activeCriteria.map(c => `${c.category}: ${c.name}`));
      console.log("Available criteria weights:", Object.keys(criteriaWeights));

      if (activeCriteria.length === 0) {
        toast({
          title: "Error",
          description: "Tidak ada kriteria yang aktif untuk perhitungan. Pastikan mapping kriteria sudah benar.",
          variant: "destructive",
        });
        return;
      }

      // Step 1: Create decision matrix - use RAW DATA
      const matrix = employees.map(emp => 
        activeCriteria.map(criterion => {
          const employeeFieldName = createEmployeeFieldMapping(criterion.name);
          const rawValue = (emp as any)[employeeFieldName] || 0;
          console.log(`Employee ${emp.name}, criterion ${criterion.name}: field=${employeeFieldName}, value=${rawValue}`);
          return rawValue;
        })
      );

      console.log("Decision Matrix (Raw Data):", matrix);
      setDecisionMatrix(matrix);

      // Step 2: Apply SAW normalization
      const normalized = matrix.map(() => new Array(activeCriteria.length).fill(0));

      for (let j = 0; j < activeCriteria.length; j++) {
        const criterion = activeCriteria[j];
        const columnValues = matrix.map(row => row[j]);
        const criterionType = criterion.type;
        
        console.log(`Normalizing criterion ${criterion.name} (${criterionType}):`, columnValues);
        
        if (criterionType === 'Benefit') {
          if (criterion.scale.includes('1-5')) {
            // Untuk skala 1-5, normalisasi dengan membagi dengan 5
            for (let i = 0; i < matrix.length; i++) {
              const rawValue = matrix[i][j];
              normalized[i][j] = rawValue / 5;
            }
            console.log(`${criterion.name} normalization (1-5 scale): [${normalized.map(row => row[j].toFixed(3)).join(', ')}]`);
          } else if (criterion.scale.includes('0-1') || criterion.scale.includes('0/1')) {
            // Untuk skala binary 0/1
            for (let i = 0; i < matrix.length; i++) {
              normalized[i][j] = matrix[i][j] === 1 ? 1.000 : 0.000;
            }
            console.log(`${criterion.name} normalization (binary): [${normalized.map(row => row[j]).join(', ')}]`);
          } else {
            // Fallback untuk benefit criteria lainnya
            const maxValue = Math.max(...columnValues);
            for (let i = 0; i < matrix.length; i++) {
              normalized[i][j] = maxValue > 0 ? matrix[i][j] / maxValue : 0;
            }
            console.log(`${criterion.name} normalization (max): [${normalized.map(row => row[j].toFixed(3)).join(', ')}]`);
          }
        } else { // Cost criteria
          if (criterion.scale.includes('0-1') || criterion.scale.includes('0/1')) {
            // Untuk binary cost criteria (seperti surat peringatan)
            for (let i = 0; i < matrix.length; i++) {
              normalized[i][j] = matrix[i][j] === 0 ? 1.000 : 0.000;
            }
            console.log(`${criterion.name} normalization (binary cost): [${normalized.map(row => row[j]).join(', ')}]`);
          } else {
            // Untuk cost criteria lainnya (seperti hari alpa, keterlambatan, dll)
            for (let i = 0; i < matrix.length; i++) {
              normalized[i][j] = matrix[i][j] > 0 ? 0.000 : 1.000;
            }
            console.log(`${criterion.name} normalization (cost): [${normalized.map(row => row[j]).join(', ')}]`);
          }
        }
      }

      console.log("Normalized Matrix:", normalized);
      setNormalizedMatrix(normalized);

      // Step 3: Calculate weighted scores (SAW method)
      const results: SAWResult[] = employees.map((employee, index) => {
        const normalizedScores = normalized[index];
        
        const finalScore = normalizedScores.reduce((sum, normalizedScore, j) => {
          const criterion = activeCriteria[j];
          const criterionFieldName = createFieldName(criterion.name);
          const weight = criteriaWeights[criterionFieldName];
          const weightedScore = normalizedScore * weight;
          
          console.log(`Employee ${employee.name}, criterion ${criterion.name}: normalized=${normalizedScore.toFixed(3)}, weight=${weight}, weighted=${weightedScore.toFixed(3)}`);
          
          return sum + weightedScore;
        }, 0);

        console.log(`Final SAW score for ${employee.name}:`, finalScore.toFixed(4));

        // PERBAIKAN: Konversi skor yang lebih akurat
        const convertedScore = parseFloat((finalScore * 5).toFixed(2));
        console.log(`Converted score for ${employee.name}: ${finalScore.toFixed(4)} -> ${convertedScore}`);
        
        const isAutoTerminated = employee.hariAlpa > 10;
        
        const { recommendation, note } = getRecommendation(convertedScore, isAutoTerminated, employee.hariAlpa);

        return {
          employee,
          normalizedScores,
          finalScore,
          convertedScore,
          rank: 0,
          recommendation,
          note
        };
      });

      // Step 4: Rank employees
      const nonTerminatedResults = results.filter(r => r.employee.hariAlpa <= 10);
      const terminatedResults = results.filter(r => r.employee.hariAlpa > 10);
      
      nonTerminatedResults.sort((a, b) => b.finalScore - a.finalScore);
      nonTerminatedResults.forEach((result, index) => {
        result.rank = index + 1;
      });
      
      terminatedResults.forEach(result => {
        result.rank = 999;
      });

      const finalResults = [...nonTerminatedResults, ...terminatedResults];

      console.log("Final Results:", finalResults);
      setFinalScores(finalResults);
      setIsCalculated(true);
      onCalculate(finalResults);

      // Save results to database
      await saveResultsToDatabase(finalResults, normalized);

      toast({
        title: "Berhasil",
        description: `Perhitungan SAW selesai menggunakan ${activeCriteria.length} kriteria yang diurutkan berdasarkan kategori dan disimpan ke database`,
      });
    } catch (error) {
      console.error('Error in SAW calculation:', error);
      toast({
        title: "Error",
        description: "Terjadi kesalahan dalam perhitungan",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getRecommendation = (convertedScore: number, isAutoTerminated: boolean, alpaDays: number): { recommendation: string, note?: string } => {
    if (isAutoTerminated) {
      return {
        recommendation: "Diberhentikan",
        note: `Karyawan diberhentikan otomatis karena alpa lebih dari ${alpaDays} hari.`
      };
    }

    if (convertedScore >= 4) {
      return { 
        recommendation: "Dapat diperpanjang",
        note: "Kandidat promosi"
      };
    } else if (convertedScore >= 3) {
      return { recommendation: "Dapat diperpanjang" };
    } else {
      return { recommendation: "Diberhentikan" };
    }
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 4) {
      return "Sangat Baik";
    } else if (score >= 3) {
      return "Baik";
    } else if (score >= 2) {
      return "Cukup";
    } else {
      return "Kurang";
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700">
            <Calculator className="w-5 h-5" />
            Perhitungan Simple Additive Weighting (SAW)
          </CardTitle>
          <p className="text-gray-600">
            Proses perhitungan otomatis menggunakan metode SAW untuk evaluasi kinerja karyawan dengan kriteria terstruktur berdasarkan kategori
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">
                  Total karyawan: <span className="font-semibold">{employees.length}</span>
                </p>
                <p className="text-sm text-gray-600">
                  Kriteria dimuat: <span className="font-semibold">{Object.keys(criteriaWeights).length}</span>
                </p>
                <p className="text-sm text-gray-600">
                  Total kriteria di database: <span className="font-semibold">{criteriaData.length}</span>
                </p>
                <p className="text-sm text-gray-600">
                  Status: {isCalculated ? (
                    <Badge variant="default" className="ml-1">Sudah dihitung</Badge>
                  ) : (
                    <Badge variant="secondary" className="ml-1">Belum dihitung</Badge>
                  )}
                </p>
                {hasSavedResults && (
                  <p className="text-sm text-gray-600">
                    <Database className="inline w-4 h-4 mr-1" />
                    Data tersimpan: <span className="font-semibold">{lastCalculationDate}</span>
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button 
                  onClick={fetchCriteriaWeights}
                  variant="outline"
                  disabled={loading}
                  size="sm"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Muat Ulang Kriteria
                </Button>
                
                {hasSavedResults && (
                  <Button 
                    onClick={loadSavedResults}
                    variant="outline"
                    disabled={loading || employees.length === 0}
                    size="sm"
                    className="text-blue-600 border-blue-600 hover:bg-blue-50"
                  >
                    <Database className="w-4 h-4 mr-2" />
                    Muat Hasil Tersimpan
                  </Button>
                )}
                
                <Button 
                  onClick={calculateSAW}
                  disabled={employees.length === 0 || loading || Object.keys(criteriaWeights).length === 0}
                  className="bg-green-600 hover:bg-green-700"
                  size="sm"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {loading ? "Menghitung..." : "Hitung SAW"}
                </Button>

                {hasSavedResults && (
                  <Button 
                    onClick={clearSavedResults}
                    variant="destructive"
                    disabled={loading}
                    size="sm"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Hapus Data Tersimpan
                  </Button>
                )}
              </div>
            </div>

            {employees.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Calculator className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Tambahkan data evaluasi karyawan terlebih dahulu</p>
              </div>
            )}

            {Object.keys(criteriaWeights).length === 0 && criteriaData.length === 0 && !loading && (
              <div className="text-center py-4 text-orange-600 bg-orange-50 rounded-lg">
                <p>Kriteria belum dimuat dari database. Pastikan ada kriteria di database dan klik "Muat Ulang Kriteria".</p>
              </div>
            )}

            {loading && (
              <div className="text-center py-4 text-blue-600 bg-blue-50 rounded-lg">
                <p>Sedang memuat data kriteria dari database...</p>
              </div>
            )}

            {hasSavedResults && !isCalculated && (
              <div className="text-center py-4 text-green-600 bg-green-50 rounded-lg">
                <Database className="w-5 h-5 inline mr-2" />
                <span>Ada hasil perhitungan tersimpan dari {lastCalculationDate}. Klik "Muat Hasil Tersimpan" untuk memuatnya.</span>
              </div>
            )}

            {criteriaData.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold mb-2">Kriteria yang Dimuat dari Database (Terstruktur berdasarkan Kategori):</h4>
                <div className="space-y-4">
                  {CATEGORY_ORDER.map(category => {
                    const categoryCriteria = criteriaData.filter(c => c.category === category);
                    if (categoryCriteria.length === 0) return null;
                    
                    return (
                      <div key={category} className="border rounded-lg p-3 bg-gray-50">
                        <h5 className="font-medium text-gray-800 mb-2">{category}</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                          {categoryCriteria.map((criteria, index) => {
                            const fieldName = createFieldName(criteria.name);
                            const isMapped = criteriaWeights[fieldName] !== undefined;
                            const globalIndex = criteriaData.indexOf(criteria);
                            const criteriaCode = `C${globalIndex + 1}`;
                            return (
                              <div key={criteria.id} className={`flex justify-between p-2 rounded ${isMapped ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                                <span><strong>{criteriaCode}:</strong> {criteria.name}</span>
                                <span className="text-gray-600">
                                  {criteria.type} - Bobot: {criteria.weight}%
                                  {isMapped ? ' ✓' : ' ✗'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Tampilkan kriteria yang tidak ada dalam kategori standar */}
                  {(() => {
                    const uncategorizedCriteria = criteriaData.filter(c => !CATEGORY_ORDER.includes(c.category));
                    if (uncategorizedCriteria.length === 0) return null;
                    
                    return (
                      <div className="border rounded-lg p-3 bg-yellow-50">
                        <h5 className="font-medium text-gray-800 mb-2">Kriteria Lainnya</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                          {uncategorizedCriteria.map((criteria) => {
                            const fieldName = createFieldName(criteria.name);
                            const isMapped = criteriaWeights[fieldName] !== undefined;
                            const globalIndex = criteriaData.indexOf(criteria);
                            const criteriaCode = `C${globalIndex + 1}`;
                            return (
                              <div key={criteria.id} className={`flex justify-between p-2 rounded ${isMapped ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                                <span><strong>{criteriaCode}:</strong> {criteria.name} ({criteria.category})</span>
                                <span className="text-gray-600">
                                  {criteria.type} - Bobot: {criteria.weight}%
                                  {isMapped ? ' ✓' : ' ✗'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Updated Normalization Rules */}
            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
              <h5 className="font-semibold mb-2">Aturan Normalisasi SAW (FLEKSIBEL & TERSTRUKTUR):</h5>
              <div className="grid grid-cols-1 gap-2 text-xs">
                <div>
                  <strong>Benefit Criteria:</strong>
                  <p>• Skala 1-5: <span className="text-blue-600 font-semibold">nilai_asli / 5</span></p>
                  <p className="ml-4 text-blue-600">- Nilai 1 → 0.200, Nilai 2 → 0.400, Nilai 3 → 0.600, Nilai 4 → 0.800, Nilai 5 → 1.000</p>
                  <p>• Binary 0/1: Rij = 1.000 jika nilai = 1, Rij = 0.000 jika nilai = 0</p>
                  <p>• Lainnya: Rij = nilai_asli / nilai_maksimum</p>
                </div>
                <div className="mt-2">
                  <strong>Cost Criteria:</strong>
                  <p>• Binary 0/1: Rij = 1.000 jika nilai = 0, Rij = 0.000 jika nilai = 1</p>
                  <p>• Lainnya: Rij = 0.000 jika nilai > 0, Rij = 1.000 jika nilai = 0</p>
                </div>
                <div className="mt-2 text-green-700">
                  <strong>Struktur Kriteria Otomatis:</strong>
                  <p>• C1-C6: Kinerja Inti (Benefit) | C7-C11: Kedisiplinan (Cost) | C12-C13: Faktor Tambahan (Mixed)</p>
                  <p>• Kriteria baru akan otomatis diurutkan berdasarkan kategori dan posisi kanonis</p>
                </div>
              </div>
            </div>

            {/* Auto termination warning */}
            <div className="mt-4 p-3 bg-red-50 rounded-lg text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-800">Aturan Pemberhentian Otomatis:</p>
                <p className="text-red-700">Karyawan dengan alpa lebih dari 10 hari akan otomatis diberhentikan</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {decisionMatrix.length > 0 && (
        <Card className="bg-white shadow-lg">
          <CardHeader>
            <CardTitle>Decision Matrix</CardTitle>
            <p className="text-sm text-gray-600">Matriks keputusan awal (nilai asli) - Kriteria diurutkan berdasarkan kategori</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableCaption>Data mentah karyawan dengan kriteria terstruktur</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Nama</TableHead>
                    {criteriaData.filter(criterion => criteriaWeights[createFieldName(criterion.name)] !== undefined).map((criterion, index) => (
                      <TableHead key={criterion.id} className="text-center">
                        <div className="text-xs">C{index + 1}</div>
                        <div className="text-xs text-gray-500">{criterion.category.replace(/^[A-C]\.\s/, '')}</div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee, index) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      {decisionMatrix[index].map((value, j) => (
                        <TableCell key={j} className="text-center">{value}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {normalizedMatrix.length > 0 && (
        <Card className="bg-white shadow-lg">
          <CardHeader>
            <CardTitle>Normalized Matrix</CardTitle>
            <p className="text-sm text-gray-600">
              Matriks yang sudah dinormalisasi menggunakan metode SAW - Kriteria terstruktur berdasarkan kategori
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableCaption>Data Normalisasi dengan kriteria terstruktur</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Nama</TableHead>
                    {criteriaData.filter(criterion => criteriaWeights[createFieldName(criterion.name)] !== undefined).map((criterion, index) => (
                      <TableHead key={criterion.id} className="text-center">
                        <div className="text-xs">C{index + 1}</div>
                        <div className="text-xs text-gray-500">{criterion.category.replace(/^[A-C]\.\s/, '')}</div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee, index) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      {normalizedMatrix[index].map((value, j) => (
                        <TableCell key={j} className="text-center">{value.toFixed(3)}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {finalScores.length > 0 && (
        <Card className="bg-white shadow-lg">
          <CardHeader>
            <CardTitle>Final Scores</CardTitle>
            <p className="text-sm text-gray-600">
              Hasil akhir perhitungan SAW dan rekomendasi dengan kriteria terstruktur
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableCaption>Hasil Perhitungan SAW dengan kriteria terstruktur berdasarkan kategori</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Peringkat</TableHead>
                    <TableHead className="w-[200px]">Nama</TableHead>
                    <TableHead>Nilai Akhir</TableHead>
                    <TableHead>Nilai Konversi</TableHead>
                    <TableHead>Rekomendasi</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {finalScores.map((result) => (
                    <TableRow key={result.employee.id}>
                      <TableCell>{result.rank === 999 ? 'Diberhentikan' : result.rank}</TableCell>
                      <TableCell className="font-medium">{result.employee.name}</TableCell>
                      <TableCell>{result.finalScore.toFixed(4)}</TableCell>
                      <TableCell>
                        {result.rank === 999 ? '-' : `${result.convertedScore.toFixed(2)} (${getScoreLabel(result.convertedScore)})`}
                      </TableCell>
                      <TableCell>{result.recommendation}</TableCell>
                      <TableCell>{result.note || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};