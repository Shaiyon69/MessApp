const { performance } = require('perf_hooks');

function runBenchmark() {
  const numOnlineUsers = 1000;
  const numDms = 500;
  const numRenders = 10000;

  const onlineUsers = Array.from({ length: numOnlineUsers }, (_, i) => `user_${i}`);
  const dms = Array.from({ length: numDms }, (_, i) => `user_${Math.floor(Math.random() * numOnlineUsers * 2)}`);

  console.log(`Benchmarking with ${numOnlineUsers} online users and ${numDms} DMs to check per render, over ${numRenders} renders.`);

  // Baseline: Array.includes
  const startArray = performance.now();
  let foundArray = 0;
  for (let r = 0; r < numRenders; r++) {
    for (let i = 0; i < dms.length; i++) {
      if (onlineUsers.includes(dms[i])) {
        foundArray++;
      }
    }
  }
  const endArray = performance.now();
  const timeArray = endArray - startArray;
  console.log(`Baseline (Array.includes): ${timeArray.toFixed(2)} ms`);

  // Optimized: Set conversion per render
  const startSet = performance.now();
  let foundSet = 0;
  for (let r = 0; r < numRenders; r++) {
    const onlineUsersSet = new Set(onlineUsers);
    for (let i = 0; i < dms.length; i++) {
      if (onlineUsersSet.has(dms[i])) {
        foundSet++;
      }
    }
  }
  const endSet = performance.now();
  const timeSet = endSet - startSet;
  console.log(`Optimized (Set conversion): ${timeSet.toFixed(2)} ms`);
  console.log(`Improvement: ${((timeArray - timeSet) / timeArray * 100).toFixed(2)}%`);
}

runBenchmark();
