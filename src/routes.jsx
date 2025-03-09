import {
  HomeIcon,
  CommandLineIcon,
  CpuChipIcon,
} from "@heroicons/react/24/solid";
import { Home } from "@/pages/dashboard";
import { Console, DGSD } from "@/pages/serial";
import { Renderer } from "@/pages/openscad";

const icon = {
  className: "w-5 h-5 text-inherit",
};

export const routes = [
  {
    layout: "dashboard",
    pages: [
      {
        icon: <HomeIcon {...icon} />,
        name: "Home",
        path: "/home",
        element: <Home />,
      },
    ],
  },
  {
    title: "Serial",
    layout: "serial",
    pages: [
      {
        icon: <CommandLineIcon {...icon} />,
        name: "console",
        path: "/console",
        element: <Console />,
      },
      {
        icon: <CpuChipIcon {...icon} />,
        name: "dgsd",
        path: "/dgsd",
        element: <DGSD />,
      },
    ],
  },
  {
    title: "OpenSCAD",
    layout: "openscad",
    pages: [
      {
        icon: <CommandLineIcon {...icon} />,
        name: "renderer",
        path: "/renderer",
        element: <Renderer />,
      },
    ],
  },
];

export default routes;
