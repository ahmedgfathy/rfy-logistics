import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { SiteLayout } from './components/layout/SiteLayout';
import Home from './pages/Home';
import About from './pages/About';
import Services from './pages/Services';
import ServiceDetail from './pages/ServiceDetail';
import RequestQuote from './pages/RequestQuote';
import TrackShipment from './pages/TrackShipment';
import Contact from './pages/Contact';
import Careers from './pages/Careers';
import Insights from './pages/Insights';
import Article from './pages/Article';
import Faq from './pages/Faq';
import { PrivacyPage, TermsPage } from './pages/Legal';
import NotFound from './pages/NotFound';

const AdminApp = lazy(() => import('./pages/admin/AdminApp'));

export default function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
        <Route path="services" element={<Services />} />
        <Route path="services/:slug" element={<ServiceDetail />} />
        <Route path="quote" element={<RequestQuote />} />
        <Route path="tracking" element={<TrackShipment />} />
        <Route path="contact" element={<Contact />} />
        <Route path="careers" element={<Careers />} />
        <Route path="insights" element={<Insights />} />
        <Route path="insights/:slug" element={<Article />} />
        <Route path="faq" element={<Faq />} />
        <Route path="privacy" element={<PrivacyPage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route
        path="/admin/*"
        element={
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center bg-steel-50 text-sm font-semibold text-steel-500">
                Loading dashboard…
              </div>
            }
          >
            <AdminApp />
          </Suspense>
        }
      />
    </Routes>
  );
}
