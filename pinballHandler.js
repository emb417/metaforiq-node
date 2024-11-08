import { promises as fs } from 'fs';

export default async function getPinballData(req, res) {
  const data = await fs.readFile('pinball.json', 'utf-8');
  res.send(data);
}