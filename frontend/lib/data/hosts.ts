import type { Host } from "@/lib/types";

const avatar = (id: string) => `https://images.unsplash.com/${id}?w=200&q=80`;

export const hosts: Host[] = [
  { id: "h1", name: "Maya", avatar: avatar("photo-1494790108377-be9c29b29330"), isSuperhost: true, responseRate: 100, joinedYear: 2016 },
  { id: "h2", name: "Liam", avatar: avatar("photo-1500648767791-00dcc994a43e"), isSuperhost: true, responseRate: 98, joinedYear: 2017 },
  { id: "h3", name: "Sofia", avatar: avatar("photo-1438761681033-6461ffad8d80"), isSuperhost: false, responseRate: 92, joinedYear: 2019 },
  { id: "h4", name: "Noah", avatar: avatar("photo-1507003211169-0a1dd7228f2d"), isSuperhost: true, responseRate: 99, joinedYear: 2015 },
  { id: "h5", name: "Emma", avatar: avatar("photo-1544005313-94ddf0286df2"), isSuperhost: false, responseRate: 88, joinedYear: 2020 },
  { id: "h6", name: "Oliver", avatar: avatar("photo-1506794778202-cad84cf45f1d"), isSuperhost: true, responseRate: 97, joinedYear: 2016 },
  { id: "h7", name: "Ava", avatar: avatar("photo-1534528741775-53994a69daeb"), isSuperhost: false, responseRate: 90, joinedYear: 2021 },
  { id: "h8", name: "Ethan", avatar: avatar("photo-1492562080023-ab3db95bfbce"), isSuperhost: true, responseRate: 100, joinedYear: 2014 },
  { id: "h9", name: "Isabella", avatar: avatar("photo-1517841905240-472988babdf9"), isSuperhost: true, responseRate: 96, joinedYear: 2018 },
  { id: "h10", name: "Lucas", avatar: avatar("photo-1463453091185-61582044d556"), isSuperhost: false, responseRate: 85, joinedYear: 2022 },
  { id: "h11", name: "Mia", avatar: avatar("photo-1502823403499-6ccfcf4fb453"), isSuperhost: true, responseRate: 99, joinedYear: 2015 },
  { id: "h12", name: "Mason", avatar: avatar("photo-1519085360753-af0119f7cbe7"), isSuperhost: false, responseRate: 91, joinedYear: 2020 },
  { id: "h13", name: "Charlotte", avatar: avatar("photo-1531123897727-8f129e1688ce"), isSuperhost: true, responseRate: 98, joinedYear: 2017 },
  { id: "h14", name: "James", avatar: avatar("photo-1500648767791-00dcc994a43e"), isSuperhost: false, responseRate: 89, joinedYear: 2021 },
  { id: "h15", name: "Amelia", avatar: avatar("photo-1487412720507-e7ab37603c6f"), isSuperhost: true, responseRate: 100, joinedYear: 2016 },
  { id: "h16", name: "Benjamin", avatar: avatar("photo-1463453091185-61582044d556"), isSuperhost: true, responseRate: 95, joinedYear: 2018 },
];
