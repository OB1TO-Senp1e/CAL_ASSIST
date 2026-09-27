async function main() {
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('test', 12);
  console.log(hash);
}

main().catch(console.error);