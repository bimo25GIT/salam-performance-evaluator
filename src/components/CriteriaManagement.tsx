import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Settings, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Criteria } from "@/types/database";

interface CriteriaManagementProps {
  onCriteriaChange?: () => void;
}

// Fixed category totals
const CATEGORY_TOTALS = {
  "A. Kinerja Inti": 60,
  "B. Kedisiplinan": 25,
  "C. Faktor Tambahan": 15
};

export const CriteriaManagement = ({ onCriteriaChange }: CriteriaManagementProps) => {
  const [criteria, setCriteria] = useState<Criteria[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCriteria, setEditingCriteria] = useState<Criteria | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    name: "",
    type: "Benefit" as "Benefit" | "Cost",
    weight: 0,
    category: "",
    scale: ""
  });

  // Calculate total weights by category
  const calculateCategoryTotals = (criteriaList: Criteria[]) => {
    const totals: { [key: string]: number } = {};
    
    criteriaList.forEach(criterion => {
      totals[criterion.category] = (totals[criterion.category] || 0) + criterion.weight;
    });
    
    return totals;
  };

  // Auto-adjust weights to maintain fixed category totals
  const autoAdjustWeights = async (newCriterion: Criteria, isEdit: boolean = false) => {
    try {
      const categoryTotal = CATEGORY_TOTALS[newCriterion.category as keyof typeof CATEGORY_TOTALS];
      if (!categoryTotal) {
        console.warn('No fixed total defined for category:', newCriterion.category);
        return;
      }

      // Get all criteria in the same category, excluding the current one if editing
      const sameCategoryCriteria = criteria.filter(c => 
        c.category === newCriterion.category && 
        (!isEdit || c.id !== newCriterion.id)
      );

      if (sameCategoryCriteria.length === 0) {
        // If this is the first criterion in this category, no adjustment needed
        return;
      }

      const currentTotalWeight = sameCategoryCriteria.reduce((sum, c) => sum + c.weight, 0);
      const remainingWeight = categoryTotal - newCriterion.weight;

      if (remainingWeight <= 0) {
        toast({
          title: "Error",
          description: `Bobot terlalu besar. Total bobot untuk kategori ${newCriterion.category} harus ${categoryTotal}%`,
          variant: "destructive",
        });
        return false;
      }

      // Adjust existing criteria proportionally to fit the remaining weight
      const adjustmentFactor = remainingWeight / currentTotalWeight;
      
      const adjustments = sameCategoryCriteria.map(criterion => ({
        id: criterion.id,
        newWeight: Math.round(criterion.weight * adjustmentFactor * 100) / 100
      }));

      // Update the adjusted weights in database
      for (const adjustment of adjustments) {
        await supabase
          .from('criteria')
          .update({ weight: adjustment.newWeight })
          .eq('id', adjustment.id);
      }

      toast({
        title: "Bobot Disesuaikan",
        description: `Bobot kriteria lain dalam kategori ${newCriterion.category} telah disesuaikan secara proporsional untuk mempertahankan total ${categoryTotal}%`,
      });

      return true;
    } catch (error) {
      console.error('Error auto-adjusting weights:', error);
      toast({
        title: "Peringatan",
        description: "Gagal menyesuaikan bobot otomatis",
        variant: "destructive",
      });
      return false;
    }
  };

  // Auto-adjust weights when criteria is deleted
  const autoAdjustAfterDeletion = async (deletedCriterion: Criteria) => {
    try {
      const categoryTotal = CATEGORY_TOTALS[deletedCriterion.category as keyof typeof CATEGORY_TOTALS];
      if (!categoryTotal) {
        console.warn('No fixed total defined for category:', deletedCriterion.category);
        return;
      }

      // Get remaining criteria in the same category
      const remainingCriteria = criteria.filter(c => 
        c.category === deletedCriterion.category && 
        c.id !== deletedCriterion.id
      );

      if (remainingCriteria.length === 0) {
        // No remaining criteria in this category
        return;
      }

      const currentTotalWeight = remainingCriteria.reduce((sum, c) => sum + c.weight, 0);
      
      if (currentTotalWeight === 0) {
        // Distribute weight equally among remaining criteria
        const equalWeight = categoryTotal / remainingCriteria.length;
        
        for (const criterion of remainingCriteria) {
          await supabase
            .from('criteria')
            .update({ weight: equalWeight })
            .eq('id', criterion.id);
        }
      } else {
        // Adjust proportionally to reach category total
        const adjustmentFactor = categoryTotal / currentTotalWeight;
        
        for (const criterion of remainingCriteria) {
          const newWeight = Math.round(criterion.weight * adjustmentFactor * 100) / 100;
          await supabase
            .from('criteria')
            .update({ weight: newWeight })
            .eq('id', criterion.id);
        }
      }

      toast({
        title: "Bobot Disesuaikan",
        description: `Bobot kriteria dalam kategori ${deletedCriterion.category} telah disesuaikan untuk mempertahankan total ${categoryTotal}%`,
      });

    } catch (error) {
      console.error('Error auto-adjusting weights after deletion:', error);
      toast({
        title: "Peringatan",
        description: "Gagal menyesuaikan bobot setelah penghapusan",
        variant: "destructive",
      });
    }
  };

  const fetchCriteria = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
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
        const typedCriteria = (data || []).map(item => ({
          ...item,
          type: item.type as 'Benefit' | 'Cost'
        })) as Criteria[];
        setCriteria(typedCriteria);
        console.log('Criteria loaded:', typedCriteria.length);
      }
    } catch (error) {
      console.error('Network error:', error);
      toast({
        title: "Error",
        description: "Gagal terhubung ke database",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCriteria();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const categoryTotal = CATEGORY_TOTALS[formData.category as keyof typeof CATEGORY_TOTALS];
    if (!categoryTotal) {
      toast({
        title: "Error",
        description: "Kategori tidak valid",
        variant: "destructive",
      });
      return;
    }

    if (formData.weight < 0 || formData.weight > categoryTotal) {
      toast({
        title: "Error",
        description: `Bobot harus antara 0 dan ${categoryTotal}% untuk kategori ${formData.category}`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const criterionData = {
        name: formData.name,
        type: formData.type,
        weight: formData.weight,
        category: formData.category,
        scale: formData.scale
      };

      if (editingCriteria) {
        // For editing, first update the criterion
        const { error } = await supabase
          .from('criteria')
          .update(criterionData)
          .eq('id', editingCriteria.id);

        if (error) throw error;

        // Then auto-adjust weights for edited criteria
        const adjustmentSuccess = await autoAdjustWeights({ ...criterionData, id: editingCriteria.id } as Criteria, true);
        
        if (!adjustmentSuccess) {
          // Rollback the update if adjustment failed
          await supabase
            .from('criteria')
            .update({
              name: editingCriteria.name,
              type: editingCriteria.type,
              weight: editingCriteria.weight,
              category: editingCriteria.category,
              scale: editingCriteria.scale
            })
            .eq('id', editingCriteria.id);
          return;
        }

        toast({
          title: "Berhasil",
          description: "Kriteria berhasil diperbarui",
        });
      } else {
        // For new criteria, first insert it
        const { data: newCriterion, error } = await supabase
          .from('criteria')
          .insert([criterionData])
          .select()
          .single();

        if (error) throw error;

        // Then auto-adjust weights for new criteria
        if (newCriterion) {
          const adjustmentSuccess = await autoAdjustWeights(newCriterion as Criteria);
          
          if (!adjustmentSuccess) {
            // Delete the new criterion if adjustment failed
            await supabase
              .from('criteria')
              .delete()
              .eq('id', newCriterion.id);
            return;
          }
        }

        toast({
          title: "Berhasil",
          description: "Kriteria baru berhasil ditambahkan",
        });
      }

      resetForm();
      setIsDialogOpen(false);
      await fetchCriteria();
      
      // Notify parent components about criteria change
      if (onCriteriaChange) {
        onCriteriaChange();
      }
    } catch (error) {
      console.error('Error saving criteria:', error);
      toast({
        title: "Error",
        description: "Gagal menyimpan kriteria",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (criteriaItem: Criteria) => {
    setEditingCriteria(criteriaItem);
    setFormData({
      name: criteriaItem.name,
      type: criteriaItem.type as "Benefit" | "Cost",
      weight: criteriaItem.weight,
      category: criteriaItem.category,
      scale: criteriaItem.scale
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus kriteria ini?')) return;

    // Find the criterion to be deleted for auto-adjustment
    const criterionToDelete = criteria.find(c => c.id === id);
    if (!criterionToDelete) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('criteria')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Auto-adjust weights after deletion
      await autoAdjustAfterDeletion(criterionToDelete);

      toast({
        title: "Berhasil",
        description: "Kriteria berhasil dihapus",
      });
      
      await fetchCriteria();
      
      // Notify parent components about criteria change
      if (onCriteriaChange) {
        onCriteriaChange();
      }
    } catch (error) {
      console.error('Error deleting criteria:', error);
      toast({
        title: "Error",
        description: "Gagal menghapus kriteria",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      type: "Benefit",
      weight: 0,
      category: "",
      scale: ""
    });
    setEditingCriteria(null);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const handleAddNewClick = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  // Calculate weight totals for display
  const categoryTotals = calculateCategoryTotals(criteria);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Manajemen Kriteria ({criteria.length})
            </CardTitle>
            <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button onClick={handleAddNewClick}>
                  <Plus className="w-4 h-4 mr-2" />
                  Tambah Kriteria
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingCriteria ? 'Edit Kriteria' : 'Tambah Kriteria Baru'}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="name">Nama Kriteria</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Kategori</Label>
                    <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A. Kinerja Inti">Kinerja Inti (Max: 60%)</SelectItem>
                        <SelectItem value="B. Kedisiplinan">Kedisiplinan (Max: 25%)</SelectItem>
                        <SelectItem value="C. Faktor Tambahan">Faktor Tambahan (Max: 15%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="type">Jenis Kriteria</Label>
                    <Select value={formData.type} onValueChange={(value: "Benefit" | "Cost") => setFormData(prev => ({ ...prev, type: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Benefit">Benefit (Lebih tinggi lebih baik)</SelectItem>
                        <SelectItem value="Cost">Cost (Lebih rendah lebih baik)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="weight">Bobot (%)</Label>
                    <Input
                      id="weight"
                      type="number"
                      step="0.01"
                      min="0"
                      max={formData.category ? CATEGORY_TOTALS[formData.category as keyof typeof CATEGORY_TOTALS] : 100}
                      value={formData.weight}
                      onChange={(e) => setFormData(prev => ({ ...prev, weight: parseFloat(e.target.value) || 0 }))}
                      required
                    />
                    {formData.category && (
                      <div className="text-sm mt-1">
                        <p className="text-gray-600">
                          Total saat ini {formData.category}: {categoryTotals[formData.category] || 0}%
                        </p>
                        <p className="text-green-600">
                          Target kategori: {CATEGORY_TOTALS[formData.category as keyof typeof CATEGORY_TOTALS]}%
                        </p>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="scale">Skala Penilaian</Label>
                    <Input
                      id="scale"
                      value={formData.scale}
                      onChange={(e) => setFormData(prev => ({ ...prev, scale: e.target.value }))}
                      placeholder="contoh: 1-5, 0-10, dll"
                      required
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={loading}>
                      {loading ? "Menyimpan..." : (editingCriteria ? "Update" : "Simpan")}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>
                      Batal
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Weight Summary */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-semibold mb-3 text-blue-800">Ringkasan Bobot per Kategori</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(CATEGORY_TOTALS).map(([category, targetTotal]) => {
                const currentTotal = categoryTotals[category] || 0;
                const isComplete = Math.abs(currentTotal - targetTotal) < 0.01;
                return (
                  <div key={category} className={`p-3 rounded border-2 ${isComplete ? 'border-green-300 bg-green-50' : 'border-yellow-300 bg-yellow-50'}`}>
                    <div className="font-medium text-sm">{category.replace(/^[A-C]\.\s/, '')}</div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-lg font-bold">{currentTotal.toFixed(1)}%</span>
                      <span className="text-sm text-gray-600">/ {targetTotal}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div 
                        className={`h-2 rounded-full ${isComplete ? 'bg-green-500' : 'bg-yellow-500'}`}
                        style={{ width: `${Math.min((currentTotal / targetTotal) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-blue-700 mt-3">
              <strong>Catatan:</strong> Sistem akan otomatis menyesuaikan bobot kriteria lain dalam kategori yang sama untuk mempertahankan total target masing-masing kategori
            </p>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
              <p className="text-gray-600">Memuat data...</p>
            </div>
          ) : criteria.length === 0 ? (
            <p className="text-center py-8 text-gray-500">Belum ada kriteria yang didefinisikan</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Kriteria</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Bobot (%)</TableHead>
                  <TableHead>Skala</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {criteria.map((criteriaItem) => (
                  <TableRow key={criteriaItem.id}>
                    <TableCell className="font-medium">{criteriaItem.name}</TableCell>
                    <TableCell>{criteriaItem.category}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs ${
                        criteriaItem.type === 'Benefit' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {criteriaItem.type}
                      </span>
                    </TableCell>
                    <TableCell>{criteriaItem.weight}%</TableCell>
                    <TableCell>{criteriaItem.scale}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(criteriaItem)}
                          disabled={loading}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(criteriaItem.id)}
                          disabled={loading}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};