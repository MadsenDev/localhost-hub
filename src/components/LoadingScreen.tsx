import { motion } from 'framer-motion';

export function LoadingScreen() {
  const containerVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  };

  const logoVariants = {
    initial: { scale: 0.8, opacity: 0 },
    animate: {
      scale: 1,
      opacity: 1,
      transition: {
        duration: 0.6,
        ease: 'easeOut'
      }
    }
  };

  // Circle pulse animation - more pronounced
  const circlePulse = {
    animate: {
      scale: [1, 1.4, 1],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut'
      }
    }
  };

  // Staggered circle animations - more pronounced
  const circleVariants = (delay: number) => ({
    animate: {
      scale: [1, 1.3, 1],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
        delay
      }
    }
  });

  // Path drawing animation for the main ring - more pronounced
  const pathVariants = {
    initial: { pathLength: 0, opacity: 0 },
    animate: {
      pathLength: [0, 1, 0, 1],
      opacity: [0, 1, 1, 1],
      transition: {
        pathLength: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
        opacity: { duration: 0.5 }
      }
    }
  };

  const textVariants = {
    initial: { opacity: 0, y: 20 },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        delay: 0.3,
        duration: 0.6,
        ease: 'easeOut'
      }
    }
  };

  const dotsVariants = {
    animate: {
      transition: {
        staggerChildren: 0.2,
        repeat: Infinity
      }
    }
  };

  const dotVariants = {
    animate: {
      y: [0, -10, 0],
      opacity: [0.3, 1, 0.3],
      transition: {
        duration: 0.6,
        repeat: Infinity,
        ease: 'easeInOut'
      }
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900"
      variants={containerVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Animated background gradient */}
      <motion.div
        className="absolute inset-0 opacity-20"
        animate={{
          background: [
            'radial-gradient(circle at 20% 50%, rgba(99, 102, 241, 0.3) 0%, transparent 50%)',
            'radial-gradient(circle at 80% 50%, rgba(139, 92, 246, 0.3) 0%, transparent 50%)',
            'radial-gradient(circle at 50% 80%, rgba(59, 130, 246, 0.3) 0%, transparent 50%)',
            'radial-gradient(circle at 20% 50%, rgba(99, 102, 241, 0.3) 0%, transparent 50%)'
          ]
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut'
        }}
      />

      <div className="relative flex flex-col items-center gap-8">
        {/* Animated Logo */}
        <motion.div
          className="relative"
          variants={logoVariants}
          initial="initial"
          animate="animate"
        >
          {/* Glow effect behind logo */}
          <motion.div
            className="absolute inset-0 -z-10 rounded-full bg-indigo-500/20 blur-2xl"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut'
            }}
            style={{
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '200px',
              height: '200px'
            }}
          />

          <motion.svg
            width="200"
            height="215"
            viewBox="-20 -20 385.37036 411.78793"
            className="relative z-10 overflow-visible"
            style={{ overflow: 'visible' }}
          >
            <defs>
              {/* Unified gradient for the donut and all lines - flows as one continuous object */}
              {/* Radial gradient centered on the donut, flows outward through all lines */}
              <radialGradient 
                id="logoGradient" 
                cx="268.17437" 
                cy="248.9517" 
                r="150"
                gradientUnits="userSpaceOnUse"
              >
                <motion.stop
                  offset="0%"
                  stopColor="#ffffff"
                  animate={{
                    stopColor: ['#ffffff', '#c7d2fe', '#818cf8', '#c7d2fe', '#ffffff']
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                />
                <motion.stop
                  offset="70%"
                  stopColor="#818cf8"
                  animate={{
                    stopColor: ['#818cf8', '#6366f1', '#4f46e5', '#6366f1', '#818cf8']
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: 0.2
                  }}
                />
                <motion.stop
                  offset="100%"
                  stopColor="#0066ff"
                  animate={{
                    stopColor: ['#0066ff', '#4f46e5', '#312e81', '#4f46e5', '#0066ff']
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: 0.4
                  }}
                />
              </radialGradient>
              {/* Blue gradient for the full circles */}
              <linearGradient id="circleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <motion.stop
                  offset="0%"
                  stopColor="#3b82f6"
                  animate={{
                    stopColor: ['#3b82f6', '#60a5fa', '#93c5fd', '#60a5fa', '#3b82f6']
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'easeInOut'
                  }}
                />
                <motion.stop
                  offset="100%"
                  stopColor="#1e40af"
                  animate={{
                    stopColor: ['#1e40af', '#3b82f6', '#60a5fa', '#3b82f6', '#1e40af']
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: 0.2
                  }}
                />
              </linearGradient>
            </defs>

            <g transform="translate(-68.380671,-45.835495)">
              {/* Lines/rectangles - rendered first so they appear behind the donut */}
              {/* Group 4 - first hub */}
              <g id="g4">
                <rect
                  width="94.838554"
                  height="26.27284"
                  x="108.93619"
                  y="-279.38922"
                  fill="url(#logoGradient)"
                  transform="rotate(90)"
                />
                <motion.circle
                  cx="266.25281"
                  cy="81.079552"
                  r="35.244057"
                  fill="url(#circleGradient)"
                  variants={circleVariants(0)}
                  animate="animate"
                />
              </g>

              {/* Group 5 - second hub */}
              <g id="g5" transform="rotate(-69.089258,258.03473,249.51635)">
                <rect
                  width="94.838554"
                  height="26.27284"
                  x="108.93619"
                  y="-279.38922"
                  fill="url(#logoGradient)"
                  transform="rotate(90)"
                />
                <motion.circle
                  cx="266.25281"
                  cy="81.079552"
                  r="35.244057"
                  fill="url(#circleGradient)"
                  variants={circleVariants(0.5)}
                  animate="animate"
                />
              </g>

              {/* Group 6 - third hub */}
              <g id="g6" transform="rotate(-136.42543,265.60305,256.05872)">
                <rect
                  width="94.838554"
                  height="26.27284"
                  x="108.93619"
                  y="-279.38922"
                  fill="url(#logoGradient)"
                  transform="rotate(90)"
                />
                <motion.circle
                  cx="266.25281"
                  cy="81.079552"
                  r="35.244057"
                  fill="url(#circleGradient)"
                  variants={circleVariants(1)}
                  animate="animate"
                />
              </g>

              {/* Group 7 - fourth hub */}
              <g id="g7" transform="matrix(0.72447787,-0.68929806,-0.68929806,-0.72447787,241.50069,607.33725)">
                <rect
                  width="94.838554"
                  height="26.27284"
                  x="94.199715"
                  y="-278.73587"
                  fill="url(#logoGradient)"
                  transform="rotate(90)"
                />
                <motion.circle
                  cx="266.25281"
                  cy="81.079552"
                  r="35.244057"
                  fill="url(#circleGradient)"
                  variants={circleVariants(1.5)}
                  animate="animate"
                />
              </g>

              {/* Main ring - path drawing animation - rendered after lines so it appears on top */}
              <motion.path
                d="m 268.17437,181.34623 a 67.604507,67.604507 0 0 0 -67.60351,67.60547 67.604507,67.604507 0 0 0 67.60351,67.60351 67.604507,67.604507 0 0 0 67.60547,-67.60351 67.604507,67.604507 0 0 0 -67.60547,-67.60547 z m -0.2168,25.63281 a 41.754494,41.754494 0 0 1 41.75391,41.75391 41.754494,41.754494 0 0 1 -41.75391,41.7539 41.754494,41.754494 0 0 1 -41.7539,-41.7539 41.754494,41.754494 0 0 1 41.7539,-41.75391 z"
                fill="url(#logoGradient)"
                variants={pathVariants}
                initial="initial"
                animate="animate"
              />

              {/* Center circle - positioned at the center of the donut */}
              <motion.circle
                cx="268.17437"
                cy="248.9517"
                r="34.868977"
                fill="url(#circleGradient)"
                variants={circlePulse}
                animate="animate"
              />
            </g>
          </motion.svg>
        </motion.div>

        {/* Brand text with animation */}
        <motion.div
          className="text-center"
          variants={textVariants}
          initial="initial"
          animate="animate"
        >
          <motion.h2
            className="text-2xl font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent"
            animate={{
              backgroundPosition: ['0%', '100%', '0%']
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'linear'
            }}
            style={{
              backgroundSize: '200% 100%'
            }}
          >
            Localhost Hub
          </motion.h2>
          <motion.div
            className="mt-3 flex items-center justify-center gap-1"
            variants={dotsVariants}
            animate="animate"
          >
            <motion.span className="text-sm text-slate-400" variants={dotVariants}>
              Loading
            </motion.span>
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="text-sm text-slate-400"
                variants={dotVariants}
                style={{ display: 'inline-block' }}
              >
                .
              </motion.span>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
