import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Employee } from "@/pages/Index";
import type { Criteria } from "@/types/database";

interface EditEmployeeDialogProps {
  employee: Employee | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedEmployee: Employee) => void;
}

// Urutan kanonis kriteria untuk konsistensi C1-C13
const CANONICAL_CRITERIA_ORDER = [
  // C1-C6: Kinerja Inti (Benefit)
  'Kualitas Kerja',
  'Tanggung Jawab', 
  'Kuantitas Kerja',
  'Pemahaman Tugas',
  'Inisiatif',
  'Kerjasama',
  // C7-C11: Kedisiplinan (Cost)
  'Jumlah Hari Alpa',
  'Jumlah Keterlambatan',
  'Jumlah Hari Izin',
  'Jumlah Hari Sakit',
  'Pulang Cepat',
  // C12-C13: Faktor Tambahan (Mixed)
  'Prestasi',
  'Surat Peringatan'
];

export const EditEmployeeDialog = ({ employee, isOpen, onClose, onUpdate }: EditEmployeeDialogProps) => {
  const [formData, setFormData] = useState<{ [key: string]: number }>({});
  const [criteria, setCriteria] = useState<Criteria[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Fungsi untuk mengkonversi nama kriteria menjadi field name yang konsisten
  const createFieldName = (criteriaName: string): string => {
    return criteriaName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Hapus karakter khusus
      .replace(/\s+/g, '_') // Ganti spasi dengan underscore
      .replace(/^_+|_+$/g, '') // Hapus underscore di awal/akhir
      .replace(/_+/g, '_'); // Ganti multiple underscore dengan single
  };

  // Mapping dinamis dari nama kriteria ke field database
  const createDatabaseFieldMapping = (criteriaName: string): string => {
    const fieldName = createFieldName(criteriaName);
    
    // Mapping khusus untuk kriteria yang sudah ada di database
    const specialMappings: { [key: string]: string } = {
      'kualitas_kerja': 'kualitas_kerja',
      'tanggung_jawab': 'tanggung_jawab',
      'kuantitas_kerja': 'kuantitas_kerja',
      'pemahaman_tugas': 'pemahaman_tugas',
      'inisiatif': 'inisiatif',
      'kerjasama': 'kerjasama',
      'jumlah_hari_alpa': 'hari_alpa',
      'jumlah_keterlambatan': 'keterlambatan',
      'jumlah_hari_izin': 'hari_izin',
      'jumlah_hari_sakit': 'hari_sakit',
      'pulang_cepat': 'pulang_cepat',
      'prestasi': 'prestasi',
      'surat_peringatan': 'surat_peringatan'
    };

    return specialMappings[fieldName] || fieldName;
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

  // Fetch criteria from database
  const fetchCriteria = async () => {
    try {
      const { data: criteriaData, error } = await supabase
        .from('criteria')
        .select('*');
      
      if (error) {
        console.error('Error fetching criteria:', error);
      } else {
        // Urutkan kriteria berdasarkan urutan kanonis
        const sortedCriteria = (criteriaData || []).sort((a, b) => {
          const indexA = CANONICAL_CRITERIA_ORDER.indexOf(a.name);
          const indexB = CANONICAL_CRITERIA_ORDER.indexOf(b.name);
          
          // Jika kriteria tidak ditemukan dalam urutan kanonis, letakkan di akhir
          if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          
          return indexA - indexB;
        });
        
        setCriteria(sortedCriteria || []);
        console.log('EditEmployeeDialog: Criteria loaded in canonical order:', sortedCriteria?.length || 0);
      }
    } catch (error) {
      console.error('Error fetching criteria:', error);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCriteria();
    }
  }, [isOpen]);

  useEffect(() => {
    if (employee && criteria.length > 0) {
      // Initialize form data dengan nilai dari employee
      const newFormData: { [key: string]: number } = {};
      
      criteria.forEach(criterion => {
        const formFieldName = createFieldName(criterion.name);
        const employeeFieldName = createEmployeeFieldMapping(criterion.name);
        const value = (employee as any)[employeeFieldName] || 0;
        newFormData[formFieldName] = value;
      });
      
      setFormData(newFormData);
      console.log('EditEmployeeDialog: Form data initialized:', newFormData);
    }
  }, [employee, criteria]);

  const handleInputChange = (field: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;

    setLoading(true);
    try {
      // PERBAIKAN: Gunakan evaluation_scores table untuk update
      // Ambil existing scores untuk employee ini
      const { data: existingScores, error: fetchError } = await supabase
        .from('evaluation_scores')
        .select('id, criteria_id')
        .eq('employee_id', employee.id);

      if (fetchError) {
        console.error('Error fetching existing scores:', fetchError);
        throw fetchError;
      }

      // Buat map dari existing scores
      const existingScoresMap = new Map<string, string>();
      (existingScores || []).forEach(score => {
        existingScoresMap.set(score.criteria_id, score.id);
      });

      // Prepare update data untuk evaluation_scores
      const evaluationScoresData = criteria.map(criterion => {
        const formFieldName = createFieldName(criterion.name);
        const existingId = existingScoresMap.get(criterion.id);
        const scoreData: any = {
          employee_id: employee.id,
          criteria_id: criterion.id,
          score: formData[formFieldName] || 0
        };

        // Sertakan ID jika skor sudah ada
        if (existingId) {
          scoreData.id = existingId;
        }

        return scoreData;
      });

      console.log('Updating evaluation scores:', evaluationScoresData);

      const { error } = await supabase
        .from('evaluation_scores')
        .upsert(evaluationScoresData, { 
          onConflict: 'employee_id,criteria_id',
          ignoreDuplicates: false 
        });

      if (error) throw error;

      // Convert back to Employee format
      const updatedEmployee: Employee = {
        ...employee,
        // Map data kembali ke format Employee interface
        kualitasKerja: formData[createFieldName('Kualitas Kerja')] || employee.kualitasKerja,
        tanggungJawab: formData[createFieldName('Tanggung Jawab')] || employee.tanggungJawab,
        kuantitasKerja: formData[createFieldName('Kuantitas Kerja')] || employee.kuantitasKerja,
        pemahamanTugas: formData[createFieldName('Pemahaman Tugas')] || employee.pemahamanTugas,
        inisiatif: formData[createFieldName('Inisiatif')] || employee.inisiatif,
        kerjasama: formData[createFieldName('Kerjasama')] || employee.kerjasama,
        hariAlpa: formData[createFieldName('Jumlah Hari Alpa')] || employee.hariAlpa,
        keterlambatan: formData[createFieldName('Jumlah Keterlambatan')] || employee.keterlambatan,
        hariIzin: formData[createFieldName('Jumlah Hari Izin')] || employee.hariIzin,
        hariSakit: formData[createFieldName('Jumlah Hari Sakit')] || employee.hariSakit,
        pulangCepat: formData[createFieldName('Pulang Cepat')] || employee.pulangCepat,
        prestasi: formData[createFieldName('Prestasi')] || employee.prestasi,
        suratPeringatan: formData[createFieldName('Surat Peringatan')] || employee.suratPeringatan
      };

      onUpdate(updatedEmployee);
      onClose();

      toast({
        title: "Berhasil",
        description: "Data evaluasi karyawan berhasil diperbarui dengan struktur terorganisir",
      });
    } catch (error) {
      console.error('Error updating evaluation:', error);
      toast({
        title: "Error",
        description: "Gagal memperbarui data evaluasi",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!employee) return null;

  // Group criteria by category for dynamic form rendering dengan urutan terstruktur
  const groupedCriteria = criteria.reduce((acc, criterion) => {
    if (!acc[criterion.category]) {
      acc[criterion.category] = [];
    }
    acc[criterion.category].push(criterion);
    return acc;
  }, {} as { [key: string]: Criteria[] });

  // Generate criteria codes (C1, C2, etc.) based on canonical order
  const getCriteriaCode = (criteriaName: string): string => {
    const index = CANONICAL_CRITERIA_ORDER.indexOf(criteriaName);
    return index !== -1 ? `C${index + 1}` : 'C?';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Evaluasi Karyawan - {employee.name}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dynamic form based on criteria from database dalam urutan terstruktur */}
          {Object.entries(groupedCriteria).map(([category, criteriaList]) => (
            <div key={category} className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800">{category}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {criteriaList.map((criterion) => {
                  const fieldName = createFieldName(criterion.name);
                  const currentValue = formData[fieldName] || 0;
                  const criteriaCode = getCriteriaCode(criterion.name);
                  
                  return (
                    <div key={criterion.id}>
                      <Label htmlFor={fieldName}>
                        {criteriaCode} - {criterion.name} ({criterion.scale})
                      </Label>
                      <Input
                        id={fieldName}
                        type="number"
                        min={criterion.type === 'Benefit' && criterion.scale.includes('1-5') ? "1" : "0"}
                        max={criterion.scale.includes('1-5') ? "5" : criterion.scale.includes('0-1') || criterion.scale.includes('0/1') ? "1" : "10"}
                        value={currentValue}
                        onChange={(e) => handleInputChange(fieldName, parseInt(e.target.value) || 0)}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Bobot: {criterion.weight}% | Tipe: {criterion.type} | Kode: {criteriaCode}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Fallback for when criteria are not loaded yet */}
          {criteria.length === 0 && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
              <p className="text-gray-600">Memuat kriteria...</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700">
              {loading ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};