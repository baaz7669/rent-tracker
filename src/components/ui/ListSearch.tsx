import { Search } from 'lucide-react';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
};

/** Search box above a list (filters as you type). */
export function ListSearch({ value, onChange, placeholder }: Props) {
  return (
    <div className="relative">
      <Search aria-hidden="true" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5E6E78] dark:text-[#8E9EA8]" />
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#D5DDE3] dark:border-[#2B3A44] bg-white dark:bg-[#18232A] text-sm text-[#1B2B34] dark:text-[#E6EDF1] placeholder-[#5E6E78] dark:placeholder-[#8E9EA8] focus:outline-hidden focus:ring-2 focus:ring-[#2E3F8F] dark:focus:ring-[#7D8CE8]"
      />
    </div>
  );
}
