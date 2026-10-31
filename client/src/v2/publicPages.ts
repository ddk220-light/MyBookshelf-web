import pages from '../../../shared/seo-libraries.json';
export const publicLibraryPath = (id: string): string | undefined => {
  const page = pages.find(page => page.id === id);
  return page ? '/libraries/' + page.slug : undefined;
};
