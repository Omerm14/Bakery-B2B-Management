import { Search } from 'lucide-react'

export default function SearchInput({ value, onChange, placeholder = 'חיפוש...', ...rest }) {
  return (
    <div className="search-input-wrap">
      <Search size={14} className="search-input-icon" aria-hidden="true" />
      <input
        type="text"
        className="input search-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        {...rest}
      />
    </div>
  )
}
