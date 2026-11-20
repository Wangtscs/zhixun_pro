import { SensorNode, Zone } from '../models/Inspection';

// Matches the downloaded Figma demo. Replace this repository when an API is available.
export const ZONES: Zone[] = [
  new Zone('A区', '供水 · 电力', 8, 4, [
    new SensorNode('A-02', 'A区', '供水舱 · K0+080', 98, '2.1', '24.1', '58', '27.8', 'normal'),
    new SensorNode('A-05', 'A区', '电力舱 · K0+180', 86, '3.6', '29.2', '54', '38.5', 'watch'),
    new SensorNode('A-08', 'A区', '电力舱 · K0+260', 95, '2.8', '25.3', '56', '29.1', 'normal')]),
  new Zone('B区', '燃气 · 通信', 12, 6, [
    new SensorNode('B-03', 'B区', '燃气舱 · K0+420', 62, '18.6', '31.8', '61', '44.2', 'alarm'),
    new SensorNode('B-07', 'B区', '燃气舱 · K0+580', 84, '11.2', '29.4', '63', '36.5', 'watch'),
    new SensorNode('B-09', 'B区', '通信舱 · K0+710', 96, '4.8', '25.6', '59', '28.4', 'normal')]),
  new Zone('C区', '热力 · 排水', 7, 3, [
    new SensorNode('C-01', 'C区', '热力舱 · K0+920', 83, '6.3', '32.4', '68', '39.6', 'watch'),
    new SensorNode('C-04', 'C区', '排水舱 · K1+040', 97, '3.4', '24.8', '72', '27.3', 'normal'),
    new SensorNode('C-06', 'C区', '排水舱 · K1+120', 94, '4.1', '25.7', '70', '29.8', 'normal')])
];
