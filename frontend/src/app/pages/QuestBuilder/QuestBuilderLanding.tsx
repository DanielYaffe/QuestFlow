import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Workflow, PlusCircle } from 'lucide-react';
import { fetchQuestlines } from '../../api/questBuilderApi';

export function QuestBuilderLanding() {
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    fetchQuestlines()
      .then((questlines) => {
        if (questlines.length > 0) {
          // Navigate to the most recently updated questline
          navigate(`/quest-builder/${questlines[0]._id}`, { replace: true });
        } else {
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
  }, [navigate]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
          <p className="text-zinc-400 text-sm">Loading your questlines...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-6 text-center max-w-sm">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex justify-center mb-4">
            <div className="bg-purple-600/20 border border-purple-600/30 rounded-xl p-4">
              <Workflow className="w-10 h-10 text-purple-400" />
            </div>
          </div>
          <h2 className="text-white text-xl font-semibold mb-2">No questlines yet</h2>
          <p className="text-zinc-400 text-sm mb-6">
            Create your first questline to start building in the Quest Builder.
          </p>
          <button
            onClick={() => navigate('/create')}
            className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors w-full justify-center"
          >
            <PlusCircle className="w-4 h-4" />
            Create a questline
          </button>
        </div>
      </div>
    </div>
  );
}
