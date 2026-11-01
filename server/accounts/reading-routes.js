// Exact allowlist; sensitive auth protocols cannot bypass application policies.
export function readingRoute(path,method){
  const fixed={
    '/api/account/state':{GET:'state'},
    '/api/account/library':{PUT:'selectLibrary'},
    '/api/account/books':{GET:'books',PUT:'save'},
    '/api/account/books/undo':{POST:'undo'},
    '/api/account/books/clear':{POST:'clear'},
    '/api/account/history':{GET:'history'},
    '/api/account/history/views':{POST:'view'},
    '/api/account/history/settings':{PATCH:'historySettings'},
    '/api/account/history/clear':{POST:'clearHistory'},
    '/api/account/imports':{POST:'importGuest'},
  };
  const reference=/^\/api\/account\/books\/([0-9a-f-]{36})$/i.exec(path);
  const historyReference=/^\/api\/account\/history\/([0-9a-f-]{36})$/i.exec(path);
  const routes=fixed[path]??(reference?{DELETE:'remove'}:historyReference?{DELETE:'removeHistory'}:null);
  return routes?{allowed:Object.keys(routes),action:routes[method],referenceId:reference?.[1]??historyReference?.[1]}:null;
}
