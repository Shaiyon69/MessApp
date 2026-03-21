const messages = Array.from({ length: 100000 }, (_, i) => ({
  content: `Message content number ${i} with some extra text to make it longer`,
  profiles: { username: `User${i % 100}` }
}));
const searchQuery = 'number 999';

console.time('baseline');
for (let i = 0; i < 100; i++) {
  const filteredMessages = searchQuery ? messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()) || m.profiles?.username.toLowerCase().includes(searchQuery.toLowerCase())) : messages;
}
console.timeEnd('baseline');

console.time('optimized');
for (let i = 0; i < 100; i++) {
  const lowerQuery = searchQuery ? searchQuery.toLowerCase() : '';
  const filteredMessages = lowerQuery ? messages.filter(m => m.content.toLowerCase().includes(lowerQuery) || m.profiles?.username.toLowerCase().includes(lowerQuery)) : messages;
}
console.timeEnd('optimized');
