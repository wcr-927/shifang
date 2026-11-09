/** Curated public-domain originals. No generated commentary or invented book attribution. */
import anthology from './homeAnthology.json';
interface HomePoem { id:string; title:string; author:string; dynasty:string; lines:string[]; excerpt?:string[]; preface?:string }
export const homePoems:HomePoem[]=[
 {id:'wang-zhongnan',title:'终南别业',author:'王维',dynasty:'唐',lines:['中岁颇好道，晚家南山陲。','兴来每独往，胜事空自知。','行到水穷处，坐看云起时。','偶然值林叟，谈笑无还期。']},
 {id:'wang-shanju',title:'山居秋暝',author:'王维',dynasty:'唐',lines:['空山新雨后，天气晚来秋。','明月松间照，清泉石上流。','竹喧归浣女，莲动下渔舟。','随意春芳歇，王孙自可留。']},
 {id:'su-shuidiao',title:'水调歌头',author:'苏轼',dynasty:'宋',excerpt:['人有悲欢离合，月有阴晴圆缺，','此事古难全。','但愿人长久，千里共婵娟。'],preface:'丙辰中秋，欢饮达旦，大醉，作此篇，兼怀子由。',lines:['明月几时有？把酒问青天。','不知天上宫阙，今夕是何年。','我欲乘风归去，又恐琼楼玉宇，高处不胜寒。','起舞弄清影，何似在人间。','转朱阁，低绮户，照无眠。','不应有恨，何事长向别时圆？','人有悲欢离合，月有阴晴圆缺，此事古难全。','但愿人长久，千里共婵娟。']},
 {id:'liu-jiangxue',title:'江雪',author:'柳宗元',dynasty:'唐',lines:['千山鸟飞绝，万径人踪灭。','孤舟蓑笠翁，独钓寒江雪。']},
 {id:'wang-luchai',title:'鹿柴',author:'王维',dynasty:'唐',lines:['空山不见人，但闻人语响。','返景入深林，复照青苔上。']},
 ...anthology
];
export const HOME_POEM_SOURCE='shifang-public-domain-poems-v1';
