
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calculator, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Criteria } from "@/types/database";

interface CriteriaTableProps {
  key?: number;
}

export const CriteriaTable = ({ key }: CriteriaTableProps) => {
  const [criteria, setCriteria] = useState<Criteria[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

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
        setCriteria((data || []) as Criteria[]);
        console.log('CriteriaTable: Loaded criteria:', (data || []).length);
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
  }, [key]);

  const groupBy = (array: Criteria[], key: keyof Criteria) => {
    return array.reduce((result, currentValue) => {
      const groupKey = currentValue[key] as string;
      (result[groupKey] = result[groupKey] || []).push(currentValue);
      return result;
    }, {} as Record<string, Criteria[]>);
  };

  const groupedCriteria = groupBy(criteria, 'category');

  // Calculate total weights by category and type
  const calculateCategoryTotals = (categoryData: Criteria[]) => {
    const totals: { [key: string]: number } = {};
    categoryData.forEach(criterion => {
      totals[criterion.type] = (totals[criterion.type] || 0) + criterion.weight;
    });
    return totals;
  };

  return (
    <Card className="bg-white shadow-lg">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2 text-green-700">
            <Calculator className="w-5 h-5" />
            Kriteria dan Bobot Penilaian ({criteria.length})
          </CardTitle>
          <Button
            onClick={fetchCriteria}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {loading ? "Memuat..." : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
            <p className="text-gray-600">Memuat kriteria...</p>
          </div>
        ) : criteria.length === 0 ? (
          <p className="text-center py-8 text-gray-500">Belum ada kriteria yang didefinisikan</p>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedCriteria).map(([category, criteriaList]) => {
              const categoryTotals = calculateCategoryTotals(criteriaList);
              
              return (
                <div key={category}>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">{category}</h3>
                    <div className="flex gap-2">
                      {Object.entries(categoryTotals).map(([type, total]) => (
                        <Badge 
                          key={type}
                          variant={total > 100 ? "destructive" : "secondary"}
                          className={type === 'Benefit' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}
                        >
                          {type}: {total.toFixed(1)}%
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border border-gray-300 px-4 py-2 text-left">Kriteria</th>
                          <th className="border border-gray-300 px-4 py-2 text-center">Tipe</th>
                          <th className="border border-gray-300 px-4 py-2 text-center">Bobot (%)</th>
                          <th className="border border-gray-300 px-4 py-2 text-center">Skala</th>
                        </tr>
                      </thead>
                      <tbody>
                        {criteriaList.map((criterion) => (
                          <tr key={criterion.id} className="hover:bg-gray-50">
                            <td className="border border-gray-300 px-4 py-2">{criterion.name}</td>
                            <td className="border border-gray-300 px-4 py-2 text-center">
                              <Badge variant={criterion.type === 'Benefit' ? 'default' : 'destructive'}>
                                {criterion.type}
                              </Badge>
                            </td>
                            <td className="border border-gray-300 px-4 py-2 text-center">
                              {criterion.weight}%
                            </td>
                            <td className="border border-gray-300 px-4 py-2 text-center">
                              {criterion.scale}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
