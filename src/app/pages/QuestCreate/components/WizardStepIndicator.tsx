import React from 'react';
import { Check } from 'lucide-react';

interface WizardStepIndicatorProps {
  currentStep: 1 | 2 | 3;
}

const STEPS = [
  { number: 1, label: 'Story' },
  { number: 2, label: 'Objectives' },
  { number: 3, label: 'Output' },
];

export function WizardStepIndicator({ currentStep }: WizardStepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((step, index) => {
        const isComplete = step.number < currentStep;
        const isActive = step.number === currentStep;

        return (
          <React.Fragment key={step.number}>
            <div className="flex flex-col items-center gap-2">
              {/* Circle */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  isComplete
                    ? 'bg-purple-600 text-white'
                    : isActive
                    ? 'bg-purple-600 text-white ring-4 ring-purple-500/20'
                    : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                }`}
              >
                {isComplete ? <Check className="w-4 h-4" /> : step.number}
              </div>
              {/* Label */}
              <span
                className={`text-xs whitespace-nowrap ${
                  isActive ? 'text-purple-400 font-medium' : isComplete ? 'text-zinc-400' : 'text-zinc-600'
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line between steps */}
            {index < STEPS.length - 1 && (
              <div
                className={`h-px w-20 mb-5 mx-1 transition-colors ${
                  step.number < currentStep ? 'bg-purple-600' : 'bg-zinc-700'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
