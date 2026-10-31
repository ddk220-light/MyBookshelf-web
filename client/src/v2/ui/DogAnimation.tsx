import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { DOG_ANIMATION_STORAGE_KEY, readDogAnimation, writeDogAnimation } from '../dogAnimation';

const DogAnimationContext = createContext({ enabled: false, setEnabled: (_enabled: boolean) => {} });
const BuckySit = lazy(() => import('../Bucky').then((module) => ({ default: module.BuckySit })));
const BuckyPeek = lazy(() => import('../Bucky').then((module) => ({ default: module.BuckyPeek })));

export function useDogAnimation() {
  return useContext(DogAnimationContext);
}

export function DogAnimationProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(readDogAnimation);
  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    writeDogAnimation(next);
  }, []);

  useEffect(() => {
    const refresh = (event: StorageEvent) => {
      if (event.key === DOG_ANIMATION_STORAGE_KEY || event.key === null) {
        setEnabledState(readDogAnimation());
      }
    };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  return <DogAnimationContext.Provider value={{ enabled, setEnabled }}>{children}</DogAnimationContext.Provider>;
}

export function DogAnimation({ pose, className }: { pose: 'sit' | 'peek'; className: string }) {
  const { enabled } = useDogAnimation();
  if (!enabled) return null;

  return <Suspense fallback={null}>
    {pose === 'sit' ? <BuckySit className={className} /> : <BuckyPeek className={className} />}
  </Suspense>;
}
