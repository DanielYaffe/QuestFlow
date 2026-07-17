import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Workflow, PlusCircle } from 'lucide-react';
import { fetchQuestlines } from '../../api/questBuilderApi';
import { useProject } from '../../context/ProjectContext';

export function QuestBuilderLanding() {
  const navigate = useNavigate();
  const { activeProjectId } = useProject();
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    setLoading(true);
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
  }, [navigate, activeProjectId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-steel-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-pulse animate-spin" />
          <p className="text-steel-400 text-sm">Loading your questlines...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center bg-steel-950">
      <div className="flex flex-col items-center gap-6 text-center max-w-sm">
        <div className="bg-steel-850 border border-steel-700 rounded-md p-6">
          <div className="flex justify-center mb-4">
            <div className="bg-steel-800 border border-pulse/30 rounded-md p-4">
              <Workflow className="w-10 h-10 text-pulse" />
            </div>
          </div>
          <h2 className="text-steel-100 text-xl font-semibold mb-2">No questlines yet</h2>
          <p className="text-steel-400 text-sm mb-6">
            Create your first questline to start building in the Quest Builder.
          </p>
          <button
            onClick={() => navigate('/create')}
            className="flex items-center gap-2 px-5 py-2.5 bg-volt hover:brightness-95 text-steel-950 font-semibold rounded-lg text-sm transition-colors w-full justify-center"
          >
            <PlusCircle className="w-4 h-4" />
            Create a questline
          </button>
        </div>
      </div>
    </div>
  );
}
