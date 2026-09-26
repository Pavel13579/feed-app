import { useEffect, useRef, useState } from "react";
import { useFetcher } from "@remix-run/react";
import { Combobox, Listbox, EmptySearchResult } from "@shopify/polaris";

interface TaxonomyResult {
  id: string | null;
  path: string;
}

interface CategoryComboboxProps {
  taxonomyKey: string;
  value: string;
  onSelect: (path: string) => void;
  label: string;
  placeholder?: string;
}

const DEBOUNCE_MS = 200;

export function CategoryCombobox({ taxonomyKey, value, onSelect, label, placeholder }: CategoryComboboxProps) {
  const fetcher = useFetcher<{ results: TaxonomyResult[] }>();
  const [inputValue, setInputValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const runSearch = (query: string) => {
    fetcher.load(`/app/api/taxonomy?key=${encodeURIComponent(taxonomyKey)}&q=${encodeURIComponent(query)}`);
  };

  const handleInputChange = (next: string) => {
    setInputValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(next), DEBOUNCE_MS);
  };

  const handleSelect = (selectedPath: string) => {
    setInputValue(selectedPath);
    onSelect(selectedPath);
  };

  const results = fetcher.data?.results ?? [];

  return (
    <Combobox
      activator={
        <Combobox.TextField
          label={label}
          labelHidden
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => runSearch(inputValue)}
          placeholder={placeholder}
          autoComplete="off"
        />
      }
    >
      {results.length > 0 ? (
        <Listbox onSelect={handleSelect}>
          {results.map((category) => (
            <Listbox.Option key={category.id ?? category.path} value={category.path}>
              {category.path}
            </Listbox.Option>
          ))}
        </Listbox>
      ) : inputValue.trim() && fetcher.state === "idle" ? (
        <EmptySearchResult title="No matching categories" description="" />
      ) : null}
    </Combobox>
  );
}