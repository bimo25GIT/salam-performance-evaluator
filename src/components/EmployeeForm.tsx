import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserPlus, User, Eye, Edit, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EditEmployeeDialog } from "@/components/EditEmployeeDialog";
import type { Employee as DBEmployee, Criteria, EvaluationScore } from "@/types/database";
import type { Employee, SAWResult } from "@/pages/Index";

interface EmployeeFormProps {
  onAddEmployee: (employee: Employee) => void;
  employees: Employee[];
  criteriaUpdateTrigger?: number;
  onEmployeeUpdate?: () => void;
}

export const EmployeeForm = ({ onAddEmployee, employees, criteriaUpdateTrigger, onEmployeeUpdate }: EmployeeFormProps) => {
  const [dbEmployees, setDbEmployees] = useState<DBEmployee[]>([]);
  const [evaluationScores, setEvaluationScores] = useState<EvaluationScore[]>([]);
  const [criteria, setCriteria] = useState<Criteria[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedEmployeeForDetail, setSelectedEmployeeForDetail] = useState<Employee | null>(null);
  const [selectedEmployeeForEdit, setSelectedEmployeeForEdit] = useState<Employee | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  
  // Dynamic form data - akan diisi berdasarkan kriteria dari database
  const [formData, setFormData] = useState<{ [criteria_id: string]: number }>({});

  const fetchCriteria = async () => {
    try {
      const { data: criteriaData, error } = await supabase
        .from('criteria')
        .select('*')
        .order('category', { ascending: true });
      
      if (error) {
        console.error('Error fetching criteria:', error);
        toast({
          title: "Error",
          description: "Gagal mengambil data kriteria",
          variant: "destructive",
        });
      } else {
        setCriteria(criteriaData || []);
        console.log('EmployeeForm: Criteria loaded:', criteriaData?.length || 0);
        
        // Initialize form data dengan semua kriteria dari database
        const newFormData: { [criteria_id: string]: number } = {};
        
        (criteriaData || []).forEach(criterion => {
          // Set default values berdasarkan tipe dan kategori kriteria
          if (criterion.type === 'Benefit') {
            if (criterion.scale.includes('1-5')) {
              newFormData[criterion.id] = 1; // Default untuk skala 1-5
            } else if (criterion.scale.includes('0-1') || criterion.scale.includes('0/1')) {
              newFormData[criterion.id] = 0; // Default untuk binary
            } else {
              newFormData[criterion.id] = 1; // Default fallback untuk benefit
            }
          } else { // Cost criteria
            newFormData[criterion.id] = 0; // Default untuk cost criteria
          }
        });
        
        setFormData(newFormData);
        console.log('Form data initialized with all criteria:', newFormData);
        console.log('Total criteria loaded:', Object.keys(newFormData).length);
      }
    } catch (error) {
      console.error('Error fetching criteria:', error);
    }
  };

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('name', { ascending: true });
      
      if (error) {
        console.error('Error fetching employees:', error);
        toast({
          title: "Error",
          description: "Gagal mengambil data karyawan dari database",
          variant: "destructive",
        });
      } else {
        setDbEmployees(data || []);
        console.log('DB Employees fetched successfully:', data?.length || 0);
      }
    } catch (error) {
      console.error('Network error fetching employees:', error);
      toast({
        title: "Error",
        description: "Gagal terhubung ke database",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchEvaluationScores = async () => {
    try {
      const { data, error } = await supabase
        .from('evaluation_scores')
        .select(`
          *,
          employees!inner(id, name, position, department, email, hire_date),
          criteria!inner(id, name, type, weight, category, scale)
        `);
      
      if (error) {
        console.error('Error fetching evaluation scores:', error);
        toast({
          title: "Error",
          description: "Gagal mengambil data evaluasi dari database",
          variant: "destructive",
        });
      } else {
        setEvaluationScores(data || []);
        console.log('Evaluation scores fetched successfully:', data?.length || 0);
      }
    } catch (error) {
      console.error('Network error fetching evaluation scores:', error);
    }
  };

  // Convert evaluation scores to Employee format for compatibility
  const convertEvaluationScoresToEmployees = (): Employee[] => {
    const employeeMap = new Map<string, Employee>();

    evaluationScores.forEach(score => {
      if (!score.employees || !score.criteria) return;

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
          (employee as any)[score.criteria.name] = score.score;
          break;
      }
    });

    return Array.from(employeeMap.values());
  };

  // Reload criteria when criteriaUpdateTrigger changes
  useEffect(() => {
    fetchCriteria();
  }, [criteriaUpdateTrigger]);

  // Auto-refresh evaluations when employees prop changes
  useEffect(() => {
    fetchEvaluationScores();
  }, [employees]);

  useEffect(() => {
    fetchEmployees();
    fetchEvaluationScores();
    fetchCriteria();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      toast({
        title: "Error",
        description: "Silakan pilih karyawan terlebih dahulu",
        variant: "destructive",
      });
      return;
    }

    const selectedEmployee = dbEmployees.find(emp => emp.id === selectedEmployeeId);
    if (!selectedEmployee) {
      toast({
        title: "Error",
        description: "Karyawan yang dipilih tidak ditemukan",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Prepare evaluation scores data
      const evaluationScoresData = criteria.map(criterion => ({
        employee_id: selectedEmployeeId,
        criteria_id: criterion.id,
        score: formData[criterion.id] || 0
      }));

      console.log('Saving evaluation scores:', evaluationScoresData);

      // Save to database using the new flexible structure
      const { data, error } = await supabase
        .from('evaluation_scores')
        .upsert(evaluationScoresData, { 
          onConflict: 'employee_id,criteria_id',
          ignoreDuplicates: false 
        })
        .select();

      if (error) throw error;

      // Convert to old format for compatibility with SAW Calculator
      const newEmployee: Employee = {
        id: selectedEmployee.id,
        name: selectedEmployee.name,
        // Map scores back to Employee interface for backward compatibility
        kualitasKerja: formData[criteria.find(c => c.name === 'Kualitas Kerja')?.id || ''] || 1,
        tanggungJawab: formData[criteria.find(c => c.name === 'Tanggung Jawab')?.id || ''] || 1,
        kuantitasKerja: formData[criteria.find(c => c.name === 'Kuantitas Kerja')?.id || ''] || 1,
        pemahamanTugas: formData[criteria.find(c => c.name === 'Pemahaman Tugas')?.id || ''] || 1,
        inisiatif: formData[criteria.find(c => c.name === 'Inisiatif')?.id || ''] || 1,
        kerjasama: formData[criteria.find(c => c.name === 'Kerjasama')?.id || ''] || 1,
        hariAlpa: formData[criteria.find(c => c.name === 'Jumlah Hari Alpa')?.id || ''] || 0,
        keterlambatan: formData[criteria.find(c => c.name === 'Jumlah Keterlambatan')?.id || ''] || 0,
        hariIzin: formData[criteria.find(c => c.name === 'Jumlah Hari Izin')?.id || ''] || 0,
        hariSakit: formData[criteria.find(c => c.name === 'Jumlah Hari Sakit')?.id || ''] || 0,
        pulangCepat: formData[criteria.find(c => c.name === 'Pulang Cepat')?.id || ''] || 0,
        prestasi: formData[criteria.find(c => c.name === 'Prestasi')?.id || ''] || 0,
        suratPeringatan: formData[criteria.find(c => c.name === 'Surat Peringatan')?.id || ''] || 0
      };

      // Add dynamic criteria as properties
      criteria.forEach(criterion => {
        if (!['Kualitas Kerja', 'Tanggung Jawab', 'Kuantitas Kerja', 'Pemahaman Tugas', 'Inisiatif', 'Kerjasama', 'Jumlah Hari Alpa', 'Jumlah Keterlambatan', 'Jumlah Hari Izin', 'Jumlah Hari Sakit', 'Pulang Cepat', 'Prestasi', 'Surat Peringatan'].includes(criterion.name)) {
          (newEmployee as any)[criterion.name] = formData[criterion.id] || 0;
        }
      });

      onAddEmployee(newEmployee);
      
      // Reset form dengan nilai default
      const defaultFormData: { [criteria_id: string]: number } = {};
      criteria.forEach(criterion => {
        if (criterion.type === 'Benefit') {
          if (criterion.scale.includes('1-5')) {
            defaultFormData[criterion.id] = 1;
          } else {
            defaultFormData[criterion.id] = 0;
          }
        } else {
          defaultFormData[criterion.id] = 0;
        }
      });
      
      setFormData(defaultFormData);
      setSelectedEmployeeId("");

      toast({
        title: "Berhasil",
        description: "Data evaluasi karyawan berhasil disimpan dengan struktur fleksibel",
      });

      fetchEvaluationScores();
    } catch (error) {
      console.error('Error saving evaluation:', error);
      toast({
        title: "Error",
        description: "Gagal menyimpan data evaluasi",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (criteria_id: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      [criteria_id]: value
    }));
  };

  const handleEmployeeDetailClick = (employee: Employee) => {
    setSelectedEmployeeForDetail(employee);
    setIsDetailDialogOpen(true);
  };

  const handleEmployeeEditClick = (employee: Employee) => {
    setSelectedEmployeeForEdit(employee);
    setIsEditDialogOpen(true);
  };

  const handleEmployeeUpdate = async (updatedEmployee: Employee) => {
    // Refresh evaluations from database to get latest data
    await fetchEvaluationScores();
    
    // Also update parent component
    onAddEmployee(updatedEmployee);
    
    // Notify parent about the update
    if (onEmployeeUpdate) {
      onEmployeeUpdate();
    }
    
    toast({
      title: "Berhasil",
      description: "Data evaluasi karyawan berhasil diperbarui",
    });
  };

  const handleEmployeeDelete = async (employeeId: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus data evaluasi karyawan ini?')) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('evaluation_scores')
        .delete()
        .eq('employee_id', employeeId);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: "Data evaluasi karyawan berhasil dihapus",
      });

      // Refresh data
      await fetchEvaluationScores();
      
      // Notify parent about the update
      if (onEmployeeUpdate) {
        onEmployeeUpdate();
      }
    } catch (error) {
      console.error('Error deleting evaluation:', error);
      toast({
        title: "Error",
        description: "Gagal menghapus data evaluasi",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Get evaluated employee IDs from the new flexible structure
  const evaluatedEmployeeIds = Array.from(new Set(evaluationScores.map(score => score.employee_id)));
  const availableEmployees = dbEmployees.filter(emp => !evaluatedEmployeeIds.includes(emp.id));

  console.log('Available employees for selection:', availableEmployees.length);
  console.log('Total DB employees:', dbEmployees.length);
  console.log('Total evaluation scores:', evaluationScores.length);

  // Group criteria by category for dynamic form rendering
  const groupedCriteria = criteria.reduce((acc, criterion) => {
    if (!acc[criterion.category]) {
      acc[criterion.category] = [];
    }
    acc[criterion.category].push(criterion);
    return acc;
  }, {} as { [key: string]: Criteria[] });

  return (
    <div className="space-y-6">
      {/* Current Employees */}
      <Card className="bg-white shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700">
            <User className="w-5 h-5" />
            Data Evaluasi Karyawan ({employees.length})
            <Badge variant="secondary" className="ml-2">
              Struktur Fleksibel
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <p className="text-gray-500 text-center py-4">Belum ada data evaluasi karyawan</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {employees.map((employee) => (
                <div key={employee.id} className="p-4 border rounded-lg bg-gray-50 relative">
                  <div className="flex justify-between items-start">
                    <h4 className="font-semibold text-gray-800">{employee.name}</h4>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEmployeeDetailClick(employee)}
                        className="h-8 w-8 p-0"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEmployeeEditClick(employee)}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEmployeeDelete(employee.id)}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-gray-600">
                    <p>Kualitas Kerja: {employee.kualitasKerja}/5</p>
                    <p>Tanggung Jawab: {employee.tanggungJawab}/5</p>
                    <p>Alpa: {employee.hariAlpa} hari</p>
                    <div className="flex gap-2 mt-2">
                      {employee.prestasi === 1 && (
                        <Badge variant="default" className="text-xs">Prestasi</Badge>
                      )}
                      {employee.suratPeringatan === 1 && (
                        <Badge variant="destructive" className="text-xs">SP</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employee Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detail Evaluasi Karyawan</DialogTitle>
          </DialogHeader>
          {selectedEmployeeForDetail && (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-xl font-semibold">{selectedEmployeeForDetail.name}</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="font-semibold text-green-700">Kinerja Inti</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Kualitas Kerja:</span>
                      <span className="font-medium">{selectedEmployeeForDetail.kualitasKerja}/5</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tanggung Jawab:</span>
                      <span className="font-medium">{selectedEmployeeForDetail.tanggungJawab}/5</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Kuantitas Kerja:</span>
                      <span className="font-medium">{selectedEmployeeForDetail.kuantitasKerja}/5</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pemahaman Tugas:</span>
                      <span className="font-medium">{selectedEmployeeForDetail.pemahamanTugas}/5</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Inisiatif:</span>
                      <span className="font-medium">{selectedEmployeeForDetail.inisiatif}/5</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Kerjasama:</span>
                      <span className="font-medium">{selectedEmployeeForDetail.kerjasama}/5</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <h4 className="font-semibold text-orange-600">Kedisiplinan</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Hari Alpa:</span>
                      <span className="font-medium">{selectedEmployeeForDetail.hariAlpa} hari</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Keterlambatan:</span>
                      <span className="font-medium">{selectedEmployeeForDetail.keterlambatan} kali</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Hari Izin:</span>
                      <span className="font-medium">{selectedEmployeeForDetail.hariIzin} hari</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Hari Sakit:</span>
                      <span className="font-medium">{selectedEmployeeForDetail.hariSakit} hari</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pulang Cepat:</span>
                      <span className="font-medium">{selectedEmployeeForDetail.pulangCepat} kali</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="border-t pt-4">
                <h4 className="font-semibold text-blue-600 mb-3">Faktor Tambahan</h4>
                <div className="flex gap-4">
                  {selectedEmployeeForDetail.prestasi === 1 && (
                    <Badge variant="default">Memiliki Prestasi</Badge>
                  )}
                  {selectedEmployeeForDetail.suratPeringatan === 1 && (
                    <Badge variant="destructive">Surat Peringatan</Badge>
                  )}
                  {selectedEmployeeForDetail.prestasi === 0 && selectedEmployeeForDetail.suratPeringatan === 0 && (
                    <span className="text-gray-500">Tidak ada faktor tambahan</span>
                  )}
                </div>
              </div>

              {/* Show dynamic criteria if any */}
              <div className="border-t pt-4">
                <h4 className="font-semibold text-purple-600 mb-3">Kriteria Tambahan</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {criteria.filter(c => !['Kualitas Kerja', 'Tanggung Jawab', 'Kuantitas Kerja', 'Pemahaman Tugas', 'Inisiatif', 'Kerjasama', 'Jumlah Hari Alpa', 'Jumlah Keterlambatan', 'Jumlah Hari Izin', 'Jumlah Hari Sakit', 'Pulang Cepat', 'Prestasi', 'Surat Peringatan'].includes(c.name)).map(criterion => (
                    <div key={criterion.id} className="flex justify-between">
                      <span>{criterion.name}:</span>
                      <span className="font-medium">{(selectedEmployeeForDetail as any)[criterion.name] || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Employee Edit Dialog */}
      <EditEmployeeDialog
        employee={selectedEmployeeForEdit}
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onUpdate={handleEmployeeUpdate}
      />

      {/* Add New Employee Evaluation Form */}
      <Card className="bg-white shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700">
            <UserPlus className="w-5 h-5" />
            Tambah Evaluasi Karyawan Baru
            {criteria.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {criteria.length} Kriteria Dimuat
              </Badge>
            )}
            <Badge variant="outline" className="ml-2 text-purple-600 border-purple-600">
              Sistem Fleksibel
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
              <p className="text-gray-600">Memuat data...</p>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Employee Selection */}
            <div>
              <Label htmlFor="employee">Pilih Karyawan</Label>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId} disabled={loading}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih karyawan untuk dievaluasi" />
                </SelectTrigger>
                <SelectContent>
                  {availableEmployees.length === 0 ? (
                    <div className="p-2 text-center text-gray-500">
                      {loading ? "Memuat..." : dbEmployees.length === 0 ? "Tidak ada data karyawan di database" : "Semua karyawan sudah dievaluasi"}
                    </div>
                  ) : (
                    availableEmployees.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name} - {employee.position} ({employee.department})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500 mt-1">
                Tersedia {availableEmployees.length} dari {dbEmployees.length} karyawan
              </p>
            </div>

            {selectedEmployeeId && criteria.length > 0 && (
              <>
                {/* Dynamic form based on criteria from database */}
                {Object.entries(groupedCriteria).map(([category, criteriaList]) => (
                  <div key={category} className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">{category}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {criteriaList.map((criterion) => {
                        const currentValue = formData[criterion.id] || 0;
                        
                        return (
                          <div key={criterion.id}>
                            <Label htmlFor={criterion.id}>
                              {criterion.name} ({criterion.scale})
                            </Label>
                            <Input
                              id={criterion.id}
                              type="number"
                              min={criterion.type === 'Benefit' && criterion.scale.includes('1-5') ? "1" : "0"}
                              max={criterion.scale.includes('1-5') ? "5" : criterion.scale.includes('0-1') || criterion.scale.includes('0/1') ? "1" : "10"}
                              value={currentValue}
                              onChange={(e) => handleInputChange(criterion.id, parseInt(e.target.value) || 0)}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Bobot: {criterion.weight}% | Tipe: {criterion.type} | ID: {criterion.id.slice(0, 8)}...
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <Button 
                  type="submit" 
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={!selectedEmployeeId || loading}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  {loading ? "Menyimpan..." : "Tambah Evaluasi Karyawan"}
                </Button>
              </>
            )}

            {selectedEmployeeId && criteria.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500">Belum ada kriteria yang didefinisikan. Silakan tambahkan kriteria terlebih dahulu.</p>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
};