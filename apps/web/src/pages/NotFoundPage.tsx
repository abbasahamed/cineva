import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Film, Home } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#f5f5f7] flex items-center justify-center p-6 selection:bg-white/20">
      <div className="max-w-md w-full p-8 rounded-3xl bg-white/[0.04] border border-white/[0.09] shadow-2xl backdrop-blur-xl text-center">
        <div className="w-12 h-12 rounded-full bg-white/[0.08] text-white/80 border border-white/[0.12] flex items-center justify-center mx-auto mb-4">
          <Film className="w-6 h-6 stroke-[1.6]" />
        </div>
        <h1 className="text-4xl font-semibold tracking-tight mb-2">404</h1>
        <h2 className="text-lg font-medium text-white/90 mb-2">Screen not found</h2>
        <p className="text-sm text-[#f5f5f7]/60 mb-6 leading-relaxed">
          The room or page you are looking for doesn’t exist or has ended.
        </p>
        <div className="flex items-center justify-center">
          <Link to="/">
            <Button
              variant="primary"
              icon={<Home className="w-4 h-4 stroke-[1.6]" />}
            >
              Back to Cineva
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};
