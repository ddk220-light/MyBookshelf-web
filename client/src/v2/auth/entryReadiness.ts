import { createContext, useContext } from "react";

export const AccountEntryPending = createContext(false);
export const useAccountEntryPending = () => useContext(AccountEntryPending);
