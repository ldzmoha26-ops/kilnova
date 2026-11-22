import { useEffect, useMemo, useState } from 'react';
import { Database, Search, ShieldAlert } from 'lucide-react';
import { EQUIPMENT_PARAMETER_REGISTRY } from '../rag/knowledgeCorpus';
import type { EquipmentParameterEntry } from '../rag/types';

const CATEGORIES = [
  'all',
  'Raw Meal & Feed',
  'Preheater & Calcination',
  'Kiln & Burners',
  'Air & Ventilation',
  'Grate Cooler',
  'Safety & Instrumentation',
] as const;

export function ParameterRegistryPanel() {
  const [parameters, setParameters] = useState<readonly EquipmentParameterEntry[]>(
    EQUIPMENT_PARAMETER_REGISTRY
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    let active = true;
    fetch('/api/parameters')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && Array.isArray(data.parameters) && data.parameters.length > 0) {
          setParameters(data.parameters);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return parameters.filter((p) => {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        p.parameterName.toLowerCase().includes(q) ||
        p.equipment.toLowerCase().includes(q) ||
        p.value.toLowerCase().includes(q) ||
        p.source.toLowerCase().includes(q) ||
        p.operationalSignificance.toLowerCase().includes(q)
      );
    });
  }, [parameters, searchQuery, selectedCategory]);

  return (
    <section
      aria-labelledby="parameter-registry-heading"
      className="overflow-hidden rounded-lg border border-[#D4DCE7] bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Database className="h-3.5 w-3.5 text-[#1D64D8]" aria-hidden="true" />
            <h3
              id="parameter-registry-heading"
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0B0C0D]"
            >
              Equipment &amp; Process Parameter Registry
            </h3>
            <span className="rounded border border-[#F59E0B]/50 bg-[#FFFBEB] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#92400E]">
              PENDING PLANT VALIDATION
            </span>
          </div>
          <p className="mt-1 text-xs text-[#475569]">
            Preliminary SCAEK kiln process parameters compiled from engineering notes. Unverified
            figures remain flagged until formal plant validation.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search equipment or parameter..."
            aria-label="Search equipment and process parameter registry"
            className="min-h-[36px] w-full rounded-md border border-[#CBD5E1] bg-white py-1.5 pr-3 pl-8 text-xs text-[#0B0C0D] placeholder:text-[#94A3B8] focus:border-[#1D64D8] focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-[#E2E8F0] bg-white px-4 py-2.5" role="tablist" aria-label="Parameter categories">
        {CATEGORIES.map((cat) => {
          const active = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded border px-2.5 py-1 font-mono text-[10px] font-medium transition-colors cursor-pointer ${
                active
                  ? 'border-[#0B0C0D] bg-[#0B0C0D] text-white font-semibold'
                  : 'border-[#CBD5E1] bg-[#F8FAFC] text-[#475569] hover:border-[#1D64D8] hover:text-[#0B0C0D]'
              }`}
            >
              {cat === 'all' ? `All (${parameters.length})` : cat}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] font-mono text-[10px] uppercase tracking-[0.06em] text-[#64748B]">
              <th className="px-4 py-2 font-medium">Parameter</th>
              <th className="px-3 py-2 font-medium">Equipment / Zone</th>
              <th className="px-3 py-2 font-medium">Reference Value</th>
              <th className="px-3 py-2 font-medium">Verification Status</th>
              <th className="px-4 py-2 font-medium">Operational Significance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F5F9]">
            {filtered.map((item) => {
              const badgeStyle =
                item.verificationStatus === 'PENDING PLANT VALIDATION'
                  ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]'
                  : item.verificationStatus === 'PROTOTYPE CONFIGURED'
                    ? 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]'
                    : 'border-[#BFDBFE] bg-[#EFF6FF] text-[#0B4EA2]';
              return (
                <tr key={item.id} className="hover:bg-[#F8FAFC]">
                  <td className="px-4 py-2.5 font-medium text-[#0B0C0D]">
                    <div>{item.parameterName}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-[#64748B]">{item.source}</div>
                  </td>
                  <td className="px-3 py-2.5 text-[#334155]">{item.equipment}</td>
                  <td className="px-3 py-2.5 font-mono font-semibold tabular-nums text-[#0B0C0D]">
                    {item.value} {item.unit}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${badgeStyle}`}
                    >
                      {item.verificationStatus === 'PENDING PLANT VALIDATION' && (
                        <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
                      )}
                      {item.verificationStatus}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[11px] leading-relaxed text-[#475569]">
                    {item.operationalSignificance}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-xs text-[#64748B]">
                  No equipment parameters match &ldquo;{searchQuery}&rdquo;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
