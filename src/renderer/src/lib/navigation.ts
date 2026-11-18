import { createContext, useContext } from 'react';

export type PageKey = 'invoice' | 'customers' | 'products' | 'company' | 'layout' | 'settings';

/** Switches the page (asks first when the current page has unsaved changes). */
export const NavigationContext = createContext<(page: PageKey) => void>(() => undefined);
export const useNavigate = () => useContext(NavigationContext);
