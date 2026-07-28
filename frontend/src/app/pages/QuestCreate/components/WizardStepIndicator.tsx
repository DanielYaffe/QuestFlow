import React from 'react';
import { Check } from 'lucide-react';

interface WizardStepIndicatorProps {
  currentStep: 1 | 2 | 3 | 4 | 5 | 6;
}

const STEPS = [
  { number: 1, label: 'Story' },
  { number: 2, label: 'Knowledge' },
  { number: 3, label: 'Style' },
  { number: 4, label: 'Objectives' },
  { number: 5, label: 'Characters' },
  { number: 6, label: 'Output' },
];

export function WizardStepIndicator({ currentStep }: WizardStepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((step, index) => {
        const isComplete = (step.number as number) < currentStep;
        const isActive = (step.number as number) === currentStep;

        return (
          <React.Fragment key={step.number}>
            <div className="flex flex-col items-center gap-2">
              {/* Circle */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  isComplete
                    ? 'bg-volt text-steel-950 font-semibold'
                    : isActive
                    ? 'bg-volt text-steel-950 font-semibold ring-4 ring-pulse/20'
                    : 'bg-steel-800 text-steel-400 border border-steel-600'
                }`}
              >
                {isComplete ? <Check className="w-4 h-4" /> : step.number}
              </div>
              {/* Label */}
              <span
                className={`text-xs whitespace-nowrap ${
                  isActive ? 'text-pulse font-medium' : isComplete ? 'text-steel-400' : 'text-steel-500'
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line between steps */}
            {index < STEPS.length - 1 && (
              <div
                className={`h-px w-14 mb-5 mx-1 transition-colors ${
                  step.number < currentStep ? 'bg-volt' : 'bg-steel-700'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
