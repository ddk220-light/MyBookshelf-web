import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {AnonymousWebApp} from '../App';
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
afterEach(()=>{cleanup();vi.unstubAllGlobals();localStorage.clear();sessionStorage.clear();});
function Location(){const value=useLocation();return <span data-testid="location">{value.pathname+value.search}</span>;}
it('provider cancellation offers recovery without exchanging or performing an account action',async()=>{
 const fetch=vi.fn(async(_path:string,_options:RequestInit)=>json({status:'guest'}));vi.stubGlobal('fetch',fetch);
 render(<MemoryRouter initialEntries={['/app/account/return?error=access_denied']}><AnonymousWebApp/></MemoryRouter>);
 expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in was cancelled');
 expect(screen.getByRole('link',{name:'Back to sign in'})).toHaveAttribute('href','/app/account/sign-in');
 expect(fetch.mock.calls.every(args=>!args[1]||args[1].method==='GET')).toBe(true);
});
it('requires a private name before completing provider onboarding',async()=>{
 let complete=false;const patches:unknown[]=[];
 vi.stubGlobal('fetch',vi.fn(async(path:string,options:RequestInit)=>{
  if(path.endsWith('/session'))return json({status:'authenticated',user:{id:'synthetic-owner',name:complete?'Private reader':'',email:'relay@example.test',emailVerified:true},csrfToken:'synthetic-csrf',needsProfileCompletion:!complete});
  if(path.endsWith('/profile')){if(options.method==='PATCH'){patches.push(JSON.parse(String(options.body)));complete=true;}return json({profileRevision:3});}
  return json({});
 }));
 render(<MemoryRouter initialEntries={['/app/account/return?returnTo=%2Fapp%2Fsearch']}><AnonymousWebApp/><Location/></MemoryRouter>);
 fireEvent.click(screen.getByRole('button',{name:'Continue to my account'}));
 expect(await screen.findByRole('heading',{name:'Add your name'})).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Your name',{exact:true}),{target:{value:'Private reader'}});
 fireEvent.submit(screen.getByRole('form',{name:'Add your name'}));
 await waitFor(()=>expect(screen.getByTestId('location')).toHaveTextContent('/app/search'));
 expect(patches).toEqual([{name:'Private reader',profileRevision:3}]);
});
