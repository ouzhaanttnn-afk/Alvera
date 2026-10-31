// Kimlik/vergi numarası sağlama kontrolleri (biçim kontrolüdür; resmi kimlik doğrulaması değildir).
export function validTckn(value: string) {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const n = [...value].map(Number);
  return (
    ((((n[0] + n[2] + n[4] + n[6] + n[8]) * 7 - (n[1] + n[3] + n[5] + n[7])) % 10) + 10) % 10 === n[9] &&
    n.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === n[10]
  );
}
export function validVkn(value: string) {
  if (!/^\d{10}$/.test(value) || /^0+$/.test(value)) return false;
  const d = [...value].map(Number);
  const sum = d.slice(0, 9).reduce((acc, digit, i) => {
    const a = (digit + 9 - i) % 10;
    const b = (a * 2 ** (9 - i)) % 9;
    return acc + (a === 0 ? 0 : b === 0 ? 9 : b);
  }, 0);
  return (10 - (sum % 10)) % 10 === d[9];
}
