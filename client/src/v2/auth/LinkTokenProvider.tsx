import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
const Context = createContext({ path: "", token: "" });
// This provider sits above identity remounts. A checking→guest transition must
// not lose a link after it has already been removed from browser history.
export function LinkTokenProvider({ children }: { children: ReactNode }) {
  const location = useLocation(),
    navigate = useNavigate();
  const [link, setLink] = useState(() => ({
    path: location.pathname,
    token: new URLSearchParams(location.search).get("token") || "",
  }));
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("token");
    if (
      token &&
      /^\/app\/account\/(verify|reset-password|email-change|reauthenticate)$/.test(
        location.pathname,
      )
    ) {
      setLink({ path: location.pathname, token });
      navigate(location.pathname, { replace: true, state: null });
    } else if (location.pathname !== link.path && link.token)
      setLink({ path: location.pathname, token: "" });
  }, [location.pathname, location.search, link.path, link.token, navigate]);
  return <Context.Provider value={link}>{children}</Context.Provider>;
}
export function useLinkToken() {
  const link = useContext(Context),
    location = useLocation();
  return link.path === location.pathname ? link.token : "";
}
