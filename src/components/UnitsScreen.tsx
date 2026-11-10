import React, { useState } from 'react';
import { formatMoney } from '../logic/format';
import { useApp } from '../context/AppContext';
import { calculateUnit, getTodayStr } from '../logic/rentEngine';
import { PropertyType, Unit, UnitCalculation } from '../types';
import { AddEditUnitModal } from './modals/AddEditUnitModal';
import { MoveOutModal } from './modals/MoveOutModal';
import { MoveInModal } from './modals/MoveInModal';
import { tenanciesOf } from '../logic/tenancy';
import { BulkImportModal } from './modals/BulkImportModal';
import { PartPaymentModal } from './modals/PartPaymentModal';
import { UnitHistoryModal } from './modals/UnitHistoryModal';
import { LeaseAgreementModal } from './modals/LeaseAgreementModal';
import {
  Search,
  Plus,
  FileSpreadsheet,
  FileSignature,
  Edit2,
  Trash2,
  Archive,
  ArchiveRestore,
  LogOut,
  UserPlus,
  History,
  DollarSign,
  Building,
  Building2,
  CheckCircle,
  AlertCircle,
  Sparkles,
  X
} from 'lucide-react';

export const UnitsScreen: React.FC = () => {
  const {
    activeUnits: units,
    archivedUnits,
    payments,
    tenancies,
    archiveUnit,
    unarchiveUnit,
    deleteUnit,
    currency,
    loadSampleUnits
  } = useApp();
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [purgeConfirmId, setPurgeConfirmId] = useState<string | null>(null);
  const [moveOutTarget, setMoveOutTarget] = useState<Unit | null>(null);
  const [moveInTarget, setMoveInTarget] = useState<Unit | null>(null);

  const lastTenancy = (unitId: string) => tenanciesOf(unitId, tenancies)[0];
  const lastTenancyEnd = (unitId: string) => lastTenancy(unitId)?.endedAt;
  const lastTenancyRent = (unitId: string) => lastTenancy(unitId)?.rent;
  const todayStr = getTodayStr();

  const [search, setSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isAgreementOpen, setIsAgreementOpen] = useState(false);
  const [agreementTargetUnit, setAgreementTargetUnit] = useState<Unit | null>(null);
  const [partPayTarget, setPartPayTarget] = useState<UnitCalculation | null>(null);
  const [historyTarget, setHistoryTarget] = useState<UnitCalculation | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Extract unique buildings and count units per building
  const buildings = Array.from(new Set(units.map((u) => u.building.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );

  const buildingCounts = units.reduce<Record<string, number>>((acc, u) => {
    const b = u.building.trim();
    acc[b] = (acc[b] || 0) + 1;
    return acc;
  }, {});

  // Filter units
  const filteredUnits = units.filter((u) => {
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      u.building.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      u.tenant.toLowerCase().includes(q) ||
      u.phone.includes(q) ||
      u.type.toLowerCase().includes(q);

    const matchesBuilding = buildingFilter === 'All' || u.building.trim() === buildingFilter;
    const matchesType = typeFilter === 'All' || u.type === typeFilter;
    return matchesSearch && matchesBuilding && matchesType;
  });

  const handleArchive = async (id: string) => {
    try {
      await archiveUnit(id);
      setDeleteConfirmId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to archive unit');
    }
  };

  const handlePurge = async (id: string) => {
    try {
      await deleteUnit(id);
      setPurgeConfirmId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete unit');
    }
  };

  const paymentCountByUnit = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.unitId] = (acc[p.unitId] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Top Action Bar: Search, Filters, Add, Paste from Excel */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5E6E78] dark:text-[#8E9EA8]" />
          <input
            type="text"
            placeholder="Search building, unit, tenant, phone, type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#18232A] text-sm text-[#1B2B34] dark:text-[#E6EDF1] placeholder-[#5E6E78] dark:placeholder-[#8E9EA8] focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]"
          />
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAgreementOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#18232A] text-[#1B2B34] dark:text-[#E6EDF1] hover:bg-gray-50 dark:hover:bg-[#24333D] transition cursor-pointer"
            title="Create a tenancy contract / lease agreement"
          >
            <FileSignature className="w-4 h-4 text-[#2E3F8F] dark:text-[#7D8CE8]" />
            <span className="hidden sm:inline">Make Agreement</span>
            <span className="sm:hidden">Agreement</span>
          </button>

          <button
            onClick={() => setIsBulkOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#18232A] text-[#1B2B34] dark:text-[#E6EDF1] hover:bg-gray-50 dark:hover:bg-[#24333D] transition cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#1F7A4D] dark:text-[#6CD39B]" />
            <span className="hidden sm:inline">Paste from Excel</span>
            <span className="sm:hidden">Excel</span>
          </button>

          <button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[#2E3F8F] hover:bg-[#243273] dark:bg-[#7D8CE8] dark:hover:bg-[#98A5F2] text-white dark:text-[#10181D] shadow-sm transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Add unit
          </button>
        </div>
      </div>

      {/* Quick-Access Building Filter Chips */}
      {buildings.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#5E6E78] dark:text-[#8E9EA8] uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#2E3F8F] dark:text-[#7D8CE8]" />
              Buildings ({buildings.length})
            </span>
            {buildingFilter !== 'All' && (
              <button
                onClick={() => setBuildingFilter('All')}
                className="flex items-center gap-1 font-semibold text-[#2E3F8F] dark:text-[#7D8CE8] hover:underline cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Show all buildings
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setBuildingFilter('All')}
              className={`tap-target px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-2 ${
                buildingFilter === 'All'
                  ? 'bg-[#2E3F8F] text-white dark:bg-[#7D8CE8] dark:text-[#10181D] shadow-xs'
                  : 'bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] text-[#5E6E78] dark:text-[#8E9EA8] hover:bg-gray-50 dark:hover:bg-[#24333D]'
              }`}
            >
              <span>All Buildings</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  buildingFilter === 'All'
                    ? 'bg-white/20 text-white dark:bg-black/20 dark:text-[#10181D]'
                    : 'bg-gray-100 dark:bg-[#2B3A44] text-gray-700 dark:text-gray-300'
                }`}
              >
                {units.length}
              </span>
            </button>

            {buildings.map((b) => {
              const count = buildingCounts[b] || 0;
              const isSelected = buildingFilter === b;

              return (
                <button
                  key={b}
                  onClick={() => setBuildingFilter(isSelected ? 'All' : b)}
                  className={`tap-target px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-2 ${
                    isSelected
                      ? 'bg-[#2E3F8F] text-white dark:bg-[#7D8CE8] dark:text-[#10181D] shadow-xs'
                      : 'bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] text-[#5E6E78] dark:text-[#8E9EA8] hover:bg-gray-50 dark:hover:bg-[#24333D]'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5 opacity-70" />
                  <span>{b}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                      isSelected
                        ? 'bg-white/20 text-white dark:bg-black/20 dark:text-[#10181D]'
                        : 'bg-gray-100 dark:bg-[#2B3A44] text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Property Type Filter Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {['All', 'Flat', 'Shop', 'Office', 'Other'].map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`tap-target px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              typeFilter === t
                ? 'bg-[#1B2B34] text-white dark:bg-[#E6EDF1] dark:text-[#10181D]'
                : 'bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] text-[#5E6E78] dark:text-[#8E9EA8] hover:bg-gray-50 dark:hover:bg-[#24333D]'
            }`}
          >
            {t}
          </button>
        ))}
        <span className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] ml-auto shrink-0 font-medium">
          Showing {filteredUnits.length} of {units.length}
        </span>
      </div>

      {/* Units List */}
      {units.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] text-center shadow-xs">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[#EDF1F4] dark:bg-[#2B3A44] flex items-center justify-center text-[#2E3F8F] dark:text-[#7D8CE8]">
            <Building className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
            No units yet
          </h3>
          <p className="text-sm text-[#5E6E78] dark:text-[#8E9EA8] max-w-md mx-auto mt-1 mb-5">
            No units yet. Add your first unit, or paste your whole list from Excel in one go.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setIsAddOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D] shadow-md transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add first unit
            </button>
            <button
              onClick={() => setIsBulkOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#18232A] text-[#1B2B34] dark:text-[#E6EDF1] hover:bg-gray-50 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-[#1F7A4D] dark:text-[#6CD39B]" />
              Paste from Excel
            </button>
            <button
              onClick={loadSampleUnits}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100 transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              Load sample portfolio
            </button>
          </div>
        </div>
      ) : filteredUnits.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] text-center shadow-xs">
          <p className="text-sm font-semibold text-[#1B2B34] dark:text-[#E6EDF1]">
            No units match your current filters.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-2 text-xs text-[#5E6E78] dark:text-[#8E9EA8]">
            {search && <span>Search: "{search}"</span>}
            {buildingFilter !== 'All' && <span>Building: "{buildingFilter}"</span>}
            {typeFilter !== 'All' && <span>Type: "{typeFilter}"</span>}
          </div>
          <button
            onClick={() => {
              setSearch('');
              setBuildingFilter('All');
              setTypeFilter('All');
            }}
            className="mt-4 px-4 py-2 text-xs font-bold rounded-xl bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D] hover:opacity-90 transition active:scale-95 cursor-pointer shadow-xs"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUnits.map((u) => {
            const calc = calculateUnit(u, payments, todayStr);

            return (
              <div
                key={u.id}
                className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#18232A] border border-[#D5DDE3] dark:border-[#2B3A44] shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-base font-bold text-[#1B2B34] dark:text-[#E6EDF1] leading-tight">
                        {u.building} · {u.name}
                      </h3>
                      <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-0.5">
                        {u.type} · {u.isVacant ? 'No tenant' : u.tenant}
                      </p>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                        calc.status === 'overdue'
                          ? 'bg-[#FDEDEB] text-[#B4341F] dark:bg-[#381A15] dark:text-[#FF8A73]'
                          : calc.status === 'today'
                          ? 'bg-[#FEF8E7] text-[#9A6A00] dark:bg-[#382B0E] dark:text-[#F0C15A]'
                          : calc.status === 'soon'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                          : calc.status === 'vacant'
                          ? 'bg-[#EDF1F4] text-[#5E6E78] dark:bg-[#2B3A44] dark:text-[#8E9EA8]'
                          : 'bg-[#E8F7EE] text-[#1F7A4D] dark:bg-[#143523] dark:text-[#6CD39B]'
                      }`}
                    >
                      {calc.statusLabel}
                    </span>
                  </div>

                  {u.isVacant ? (
                    <p className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] mt-3 pt-2.5 border-t border-[#D5DDE3]/60 dark:border-[#2B3A44]/60">
                      {lastTenancyEnd(u.id)
                        ? `Vacant since ${lastTenancyEnd(u.id)}. Move a tenant in to start tracking rent again.`
                        : 'Move a tenant in to start tracking rent.'}
                    </p>
                  ) : (
                  <div className="text-xs text-[#5E6E78] dark:text-[#8E9EA8] space-y-1 mt-3 pt-2.5 border-t border-[#D5DDE3]/60 dark:border-[#2B3A44]/60">
                    <div className="flex justify-between">
                      <span>Cycle Rent:</span>
                      <span className="font-semibold text-[#1B2B34] dark:text-[#E6EDF1]">
                        {formatMoney(u.rent, currency)} / {u.every === 1 ? 'month' : `${u.every} mos`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>First Tracked Due:</span>
                      <span className="font-mono text-xs">{u.firstDue}</span>
                    </div>
                    {u.phone && (
                      <div className="flex justify-between">
                        <span>Phone:</span>
                        <span className="font-mono text-xs">{u.phone}</span>
                      </div>
                    )}
                    {u.leaseEnd && (
                      <div className="flex justify-between">
                        <span>Lease ends:</span>
                        <span className="font-mono text-xs text-[#9A6A00] dark:text-[#F0C15A]">
                          {u.leaseEnd}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-medium pt-1">
                      <span>Current Balance:</span>
                      <span
                        className={`font-black ${
                          calc.balance > 0
                            ? 'text-[#B4341F] dark:text-[#FF8A73]'
                            : 'text-[#1F7A4D] dark:text-[#6CD39B]'
                        }`}
                      >
                        {formatMoney(calc.balance, currency)}
                      </span>
                    </div>
                    {(u.deposit?.amount || 0) > 0 && (
                      <div className="flex justify-between">
                        <span>Deposit held:</span>
                        <span className="font-semibold">
                          {formatMoney(u.deposit!.amount, currency)}
                        </span>
                      </div>
                    )}
                    {calc.pendingChequeTotal > 0 && (
                      <div className="flex justify-between text-[#9A6A00] dark:text-[#F0C15A]">
                        <span>Pending cheques:</span>
                        <span className="font-semibold">
                          {formatMoney(calc.pendingChequeTotal, currency)}
                        </span>
                      </div>
                    )}
                  </div>
                  )}
                </div>

                {/* Card Action Buttons */}
                <div className="mt-4 pt-3 border-t border-[#D5DDE3]/60 dark:border-[#2B3A44]/60 space-y-2">
                  <div className="flex items-center gap-2">
                    {u.isVacant ? (
                      <button
                        onClick={() => setMoveInTarget(u)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#1F7A4D] hover:bg-[#18623D] dark:bg-[#6CD39B] dark:hover:bg-[#8BE0B2] text-white dark:text-[#10181D] transition active:scale-95 cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Move in tenant
                      </button>
                    ) : (
                    <button
                      onClick={() => setPartPayTarget(calc)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#2E3F8F] hover:bg-[#243273] dark:bg-[#7D8CE8] dark:hover:bg-[#98A5F2] text-white dark:text-[#10181D] transition active:scale-95 cursor-pointer"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      Record payment
                    </button>
                    )}

                    {/* History button */}
                    <button
                      onClick={() => setHistoryTarget(calc)}
                      title="View due items history & statement"
                      className="p-2 rounded-xl bg-[#EDF1F4] dark:bg-[#2B3A44] text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1] transition cursor-pointer"
                    >
                      <History className="w-4 h-4" />
                    </button>

                    {/* Make Lease Agreement for this unit */}
                    {!u.isVacant && (
                    <button
                      onClick={() => setAgreementTargetUnit(u)}
                      title="Make or Print Tenancy Agreement"
                      className="p-2 rounded-xl bg-[#EDF1F4] dark:bg-[#2B3A44] text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#2E3F8F] dark:hover:text-[#7D8CE8] transition cursor-pointer"
                    >
                      <FileSignature className="w-4 h-4" />
                    </button>
                    )}

                    {/* Move the current tenant out */}
                    {!u.isVacant && (
                      <button
                        onClick={() => setMoveOutTarget(u)}
                        title="Move tenant out (settle deposit)"
                        aria-label={`Move ${u.tenant} out`}
                        className="p-2 rounded-xl bg-[#EDF1F4] dark:bg-[#2B3A44] text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1] transition cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                      </button>
                    )}

                    {/* Edit unit button */}
                    <button
                      onClick={() => setEditingUnit(u)}
                      title="Edit unit details"
                      className="p-2 rounded-xl bg-[#EDF1F4] dark:bg-[#2B3A44] text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1] transition cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    {/* Archive unit button */}
                    <button
                      onClick={() => setDeleteConfirmId(u.id)}
                      title="Archive unit (keeps its payments)"
                      aria-label={`Archive ${u.name}`}
                      className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 hover:bg-amber-100 transition cursor-pointer"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Inline Archive Confirmation */}
                  {deleteConfirmId === u.id && (
                    <div className="p-3 bg-[#FFF6E5] dark:bg-[#33280F] border border-[#B7791F]/30 rounded-xl space-y-2 text-xs">
                      <p className="font-semibold text-[#8A5A12] dark:text-[#F2C46D]">
                        Archive {u.name}? It leaves your daily lists, but its payment history is kept and you can
                        restore it any time.
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleArchive(u.id)}
                          className="px-3 py-1 bg-[#8A5A12] text-white font-bold rounded-lg cursor-pointer"
                        >
                          Archive
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-3 py-1 bg-white dark:bg-[#18232A] text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Archived units: restore, or delete forever */}
      {archivedUnits.length > 0 && (
        <section
          aria-labelledby="archived-units-heading"
          className="rounded-2xl border border-[#D5DDE3] dark:border-[#2B3A44] bg-white/60 dark:bg-[#18232A]/60"
        >
          <button
            type="button"
            onClick={() => setIsArchiveOpen((open) => !open)}
            aria-expanded={isArchiveOpen}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-[#5E6E78] dark:text-[#8E9EA8] hover:text-[#1B2B34] dark:hover:text-[#E6EDF1] cursor-pointer"
          >
            <span id="archived-units-heading" className="flex items-center gap-2">
              <Archive className="w-4 h-4" />
              Archived units ({archivedUnits.length})
            </span>
            <span className="text-xs">{isArchiveOpen ? 'Hide' : 'Show'}</span>
          </button>

          {isArchiveOpen && (
            <ul className="divide-y divide-[#D5DDE3] dark:divide-[#2B3A44] border-t border-[#D5DDE3] dark:border-[#2B3A44]">
              {archivedUnits.map((u) => (
                <li key={u.id} className="px-4 py-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm">
                      <span className="font-bold text-[#1B2B34] dark:text-[#E6EDF1]">
                        {u.building} · {u.name}
                      </span>
                      <span className="text-[#5E6E78] dark:text-[#8E9EA8]">
                        {' '}
                        — {u.tenant} · {paymentCountByUnit[u.id] || 0} payment(s) kept
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => unarchiveUnit(u.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#2E3F8F] dark:bg-[#7D8CE8] text-white dark:text-[#10181D] cursor-pointer"
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" />
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => setPurgeConfirmId(u.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#B4341F] dark:text-[#FF8A73] hover:bg-[#FDEDEB] dark:hover:bg-[#381A15] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete forever
                      </button>
                    </div>
                  </div>
                  {purgeConfirmId === u.id && (
                    <div className="p-3 bg-[#FDEDEB] dark:bg-[#381A15] border border-[#B4341F]/30 rounded-xl space-y-2 text-xs">
                      <p className="font-semibold text-[#B4341F] dark:text-[#FF8A73]">
                        Permanently delete {u.name} and its {paymentCountByUnit[u.id] || 0} payment(s)? This cannot be
                        undone. Make a backup first if you might need this history.
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handlePurge(u.id)}
                          className="px-3 py-1 bg-[#B4341F] text-white font-bold rounded-lg cursor-pointer"
                        >
                          Delete forever
                        </button>
                        <button
                          type="button"
                          onClick={() => setPurgeConfirmId(null)}
                          className="px-3 py-1 bg-white dark:bg-[#18232A] text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {moveOutTarget && <MoveOutModal unit={moveOutTarget} onClose={() => setMoveOutTarget(null)} />}
      {moveInTarget && (
        <MoveInModal
          unit={moveInTarget}
          suggestedRent={lastTenancyRent(moveInTarget.id)}
          onClose={() => setMoveInTarget(null)}
        />
      )}

      {/* Add / Edit Unit Modal */}
      {(isAddOpen || editingUnit) && (
        <AddEditUnitModal
          isOpen={isAddOpen || !!editingUnit}
          onClose={() => {
            setIsAddOpen(false);
            setEditingUnit(null);
          }}
          unitToEdit={editingUnit}
        />
      )}

      {/* Bulk Importer */}
      {isBulkOpen && (
        <BulkImportModal
          isOpen={isBulkOpen}
          onClose={() => setIsBulkOpen(false)}
        />
      )}

      {/* Record Payment Modal */}
      {partPayTarget && (
        <PartPaymentModal
          isOpen={!!partPayTarget}
          onClose={() => setPartPayTarget(null)}
          calc={partPayTarget}
        />
      )}

      {/* History Modal */}
      {historyTarget && (
        <UnitHistoryModal
          isOpen={!!historyTarget}
          onClose={() => setHistoryTarget(null)}
          calc={historyTarget}
        />
      )}

      {/* Lease Agreement Modal */}
      {(isAgreementOpen || agreementTargetUnit) && (
        <LeaseAgreementModal
          isOpen={isAgreementOpen || !!agreementTargetUnit}
          onClose={() => {
            setIsAgreementOpen(false);
            setAgreementTargetUnit(null);
          }}
          preselectedUnit={agreementTargetUnit}
        />
      )}
    </div>
  );
};
