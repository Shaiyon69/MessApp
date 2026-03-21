const { performance } = require('perf_hooks');

const messages = Array.from({ length: 10000 }).map((_, i) => ({
  content: `Hello world, this is message ${i}`,
  profiles: { username: `user_${i}` }
}));

const searchQuery = 'message 999';

function unoptimizedRender() {
  const filteredMessages = searchQuery ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()) || m.profiles?.username.toLowerCase().includes(searchQuery.toLowerCase())) : messages;
  return filteredMessages;
}

let memoizedResult = null;
let lastMessages = null;
let lastSearchQuery = null;

function memoizedRender() {
  if (messages !== lastMessages || searchQuery !== lastSearchQuery) {
    const lowerQuery = searchQuery.toLowerCase();
    memoizedResult = searchQuery ? messages.filter(m =>
      m.content.toLowerCase().includes(lowerQuery) ||
      m.profiles?.username.toLowerCase().includes(lowerQuery)
    ) : messages;
    lastMessages = messages;
    lastSearchQuery = searchQuery;
  }
  return memoizedResult;
}

const unoptimizedStart = performance.now();
for (let i = 0; i < 1000; i++) {
  unoptimizedRender();
}
const unoptimizedEnd = performance.now();
console.log(`Unoptimized (1000 renders): ${unoptimizedEnd - unoptimizedStart} ms`);

const optimizedStart = performance.now();
for (let i = 0; i < 1000; i++) {
  memoizedRender();
}
const optimizedEnd = performance.now();
console.log(`Optimized (1000 renders): ${optimizedEnd - optimizedStart} ms`);
