import React from "react";

type Props = {
  progress: number;
  size?: number;        // circle size in px
  strokeWidth?: number; // thickness of ring
};

const EpochProgressCircle: React.FC<Props> = ({
  progress,
  size = 80,
  strokeWidth = 15,
}) => {
 
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (progress / 100) * circumference;

  return (
    <div style={{ width: size, height: size, position: "relative" }}>
      <svg width={size} height={size}>
        {/* Background circle */}
        <circle
          stroke="#9F9FAC"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />

        {/* Progress circle */}
        <circle
          stroke="#5A5A62"
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          r={radius}
          cx={size / 2}
          cy={size / 2}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: "stroke-dashoffset 0.5s ease",
          }}
        />
      </svg>
    </div>
  );
};

export default EpochProgressCircle;