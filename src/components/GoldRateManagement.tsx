import { useState } from 'react';
import { Edit2, Save, X, Info } from 'lucide-react';
import { GoldRate, User } from '../types';
import { getAllGoldRates, updateGoldRate as dbUpdateGoldRate } from '../lib/db/goldRateService';
import { logActivity } from '../lib/activityLogger';
import { Button } from './ui/button';

interface GoldRateManagementProps {
  currentUser: User;
}

export function GoldRateManagement({ currentUser }: GoldRateManagementProps) {
  const [goldRates, setGoldRates] = useState<GoldRate[]>(() => {
    try { return getAllGoldRates(); } catch { return []; }
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState('');

  const refreshRates = () => { try { setGoldRates(getAllGoldRates()); } catch {} };



  const handleEdit = (rate: GoldRate) => {
    setEditingId(rate.id);
    setEditRate(rate.ratePerGram.toString());
  };

  const handleSave = (id: string) => {
    const rate = goldRates.find(r => r.id === id);
    const oldRate = rate?.ratePerGram || 0;
    const newRate = parseFloat(editRate);
    
    dbUpdateGoldRate(id, newRate);
    refreshRates();
    setEditingId(null);
    
    // Log activity
    if (rate) {
      logActivity(
        currentUser,
        'gold_rate_updated',
        `Updated ${rate.goldType} gold rate`,
        `From ₹${oldRate.toLocaleString()}/g to ₹${newRate.toLocaleString()}/g`
      );
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditRate('');
  };



  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold text-gray-900">Gold Rate Management</h2>
          <p className="text-sm md:text-base text-gray-500 mt-1">Manage and update current gold rates</p>
        </div>
      </div>



      {/* Current Gold Rates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 lg:items-stretch">
        {goldRates.map((rate) => {
          const isEditing = editingId === rate.id;

          return (
            <div key={rate.id} className="bg-white rounded-none border border-black/15 p-4 md:p-6 border border-black/15 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col h-full">
              <div className="flex-1">
                <div className="flex items-start justify-between mb-3 md:mb-4">
                  <div>
                    <p className="text-xs md:text-sm text-gray-500 font-medium font-medium">Gold Type</p>
                    <p className="text-lg md:text-xl font-bold text-gray-900 mt-1">{rate.goldType}</p>
                  </div>
                </div>

                <div className="space-y-2 md:space-y-3">
                  <div>
                    <p className="text-xs md:text-sm text-gray-500 font-medium">Rate per Gram</p>
                    {isEditing ? (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-base md:text-lg font-bold text-gray-900">₹</span>
                        <input
                          type="number"
                          step="0.01"
                          value={editRate}
                          onChange={(e) => setEditRate(e.target.value)}
                          className="w-full px-3 py-2 text-base md:text-lg border-2 border-black/15 rounded-none border border-black/15 focus:ring-0 focus:border-black/15 font-black"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <p className="text-2xl md:text-3xl font-black text-gray-900 mt-1 tracking-tight">₹{rate.ratePerGram.toLocaleString()}</p>
                    )}
                  </div>

                  <p className="text-[10px] md:text-xs text-gray-400 font-medium">Last updated: {new Date(rate.updatedAt).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-black/15 flex-shrink-0">
                {isEditing ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSave(rate.id)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 md:px-4 py-2 text-sm md:text-base font-semibold bg-green-500 text-white rounded-none border border-black/15 hover:bg-green-600 transition-colors shadow-sm shadow-green-100"
                    >
                      <Save className="w-4 h-4" />
                      Save
                    </button>
                    <button
                      onClick={handleCancel}
                      className="flex-1 flex items-center justify-center gap-2 px-3 md:px-4 py-2 text-sm md:text-base font-semibold bg-gray-100 text-gray-700 rounded-none border border-black/15 hover:bg-gray-200 transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleEdit(rate)}
                    className="w-full flex items-center justify-center gap-2 px-3 md:px-4 py-2 text-sm md:text-base font-semibold bg-yellow-500 text-white rounded-none border border-black/15 hover:bg-yellow-600 transition-colors shadow-sm shadow-yellow-100"
                  >
                    <Edit2 className="w-4 h-4" />
                    Update Rate
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>


      {/* Information Card */}
      <div className="bg-blue-50 border border-black/15 rounded-none border border-black/15 p-4 md:p-6 shadow-sm hover:shadow-md transition-all duration-300">
        <h4 className="font-bold text-sm md:text-base text-blue-900 mb-2 flex items-center gap-2">
          <Info className="w-4 h-4" />
          Important Information
        </h4>
        <ul className="space-y-2 text-xs md:text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 flex-shrink-0" />
            <span>Gold rates are indicative and may vary based on market conditions</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 flex-shrink-0" />
            <span>Update rates regularly to ensure accurate loan calculations</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 flex-shrink-0" />
            <span>Changes in gold rates will affect new loan calculations only</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 flex-shrink-0" />
            <span>All existing loans maintain their original gold valuation</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
