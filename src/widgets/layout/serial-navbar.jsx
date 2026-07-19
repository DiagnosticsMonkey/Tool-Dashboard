import { useContext } from "react";
import { useLocation, Link } from "react-router-dom";
import {
  Navbar,
  Typography,
  IconButton,
  Button,
  Breadcrumbs,
  Chip,
  Select,
  Option,
  Switch,
  Tooltip,
  Popover,
  PopoverHandler,
  PopoverContent,
} from "@material-tailwind/react";
import {
  Cog6ToothIcon,
  Bars3Icon,
  SignalSlashIcon,
  SignalIcon,
  AdjustmentsHorizontalIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/solid";
import {
  useMaterialTailwindController,
  setOpenConfigurator,
  setOpenSidenav,
} from "@/context";
import { WebSerialHandler, BAUD_RATES } from "@/context/webserialhandler";

export function SerialNavbar() {
  const [controller, dispatch] = useMaterialTailwindController();
  const { fixedNavbar, openSidenav } = controller;
  const { pathname } = useLocation();
  const [layout, page] = pathname.split("/").filter((el) => el !== "");

  const {
    isSupported,
    isConnected,
    isBusy,
    connect,
    disconnect,
    settings,
    setSettings,
    detectBaudRate,
    detectStatus,
    autoReconnect,
    setAutoReconnect,
  } = useContext(WebSerialHandler);

  const updateSetting = (key, value) =>
    setSettings((s) => ({ ...s, [key]: value }));

  return (
    <Navbar
      color={fixedNavbar ? "white" : "transparent"}
      className={`rounded-xl transition-all ${
        fixedNavbar
          ? "sticky top-4 z-40 py-3 shadow-md shadow-blue-gray-500/5"
          : "px-0 py-1"
      }`}
      fullWidth
      blurred={fixedNavbar}
    >
      <div className="flex flex-col-reverse justify-between gap-6 md:flex-row md:items-center">
        <div className="capitalize">
          <Breadcrumbs
            className={`bg-transparent p-0 transition-all ${
              fixedNavbar ? "mt-1" : ""
            }`}
          >
            <Link to={`/${layout}`}>
              <Typography
                variant="small"
                color="blue-gray"
                className="font-normal opacity-50 transition-all hover:text-blue-500 hover:opacity-100"
              >
                {layout}
              </Typography>
            </Link>
            <Typography
              variant="small"
              color="blue-gray"
              className="font-normal"
            >
              {page}
            </Typography>
          </Breadcrumbs>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Connection Status */}
          <Chip
            size="sm"
            variant="ghost"
            color={isConnected ? "green" : "red"}
            value={
              isConnected
                ? `Connected @ ${settings.baudRate}`
                : detectStatus || "Disconnected"
            }
          />

          {/* Port settings popover */}
          <Popover placement="bottom-end">
            <PopoverHandler>
              <Button
                variant="text"
                size="sm"
                color="blue-gray"
                className="flex items-center gap-2 normal-case"
              >
                <AdjustmentsHorizontalIcon className="h-5 w-5" />
                {settings.baudRate} {settings.dataBits}
                {settings.parity[0].toUpperCase()}
                {settings.stopBits}
              </Button>
            </PopoverHandler>
            <PopoverContent className="z-50 flex w-72 flex-col gap-4">
              <Typography variant="h6" color="blue-gray">
                Port Settings
              </Typography>
              <Select
                label="Baud rate"
                value={String(settings.baudRate)}
                onChange={(v) => updateSetting("baudRate", Number(v))}
                disabled={isConnected}
              >
                {BAUD_RATES.map((r) => (
                  <Option key={r} value={String(r)}>
                    {r}
                  </Option>
                ))}
              </Select>
              <div className="flex gap-2">
                <Select
                  label="Data bits"
                  value={String(settings.dataBits)}
                  onChange={(v) => updateSetting("dataBits", Number(v))}
                  disabled={isConnected}
                >
                  <Option value="7">7</Option>
                  <Option value="8">8</Option>
                </Select>
                <Select
                  label="Stop bits"
                  value={String(settings.stopBits)}
                  onChange={(v) => updateSetting("stopBits", Number(v))}
                  disabled={isConnected}
                >
                  <Option value="1">1</Option>
                  <Option value="2">2</Option>
                </Select>
              </div>
              <div className="flex gap-2">
                <Select
                  label="Parity"
                  value={settings.parity}
                  onChange={(v) => updateSetting("parity", v)}
                  disabled={isConnected}
                >
                  <Option value="none">None</Option>
                  <Option value="even">Even</Option>
                  <Option value="odd">Odd</Option>
                </Select>
                <Select
                  label="Flow control"
                  value={settings.flowControl}
                  onChange={(v) => updateSetting("flowControl", v)}
                  disabled={isConnected}
                >
                  <Option value="none">None</Option>
                  <Option value="hardware">Hardware</Option>
                </Select>
              </div>
              <Switch
                label={
                  <Typography variant="small" color="blue-gray">
                    Auto-reconnect
                  </Typography>
                }
                checked={autoReconnect}
                onChange={(e) => setAutoReconnect(e.target.checked)}
                crossOrigin=""
              />
              <Button
                variant="outlined"
                size="sm"
                color="blue-gray"
                className="flex items-center justify-center gap-2"
                onClick={() => detectBaudRate()}
                disabled={isConnected || isBusy}
              >
                <MagnifyingGlassIcon className="h-4 w-4" />
                {detectStatus || "Auto-detect baud"}
              </Button>
            </PopoverContent>
          </Popover>

          {/* Connect / Disconnect */}
          <Tooltip content={isConnected ? "Disconnect" : "Connect"}>
            <IconButton
              variant="text"
              color={isConnected ? "green" : "red"}
              onClick={() => (isConnected ? disconnect() : connect())}
              disabled={isBusy || !isSupported}
            >
              {isConnected ? (
                <SignalIcon className="h-6 w-6 text-green-500" />
              ) : (
                <SignalSlashIcon className="h-6 w-6 text-red-500" />
              )}
            </IconButton>
          </Tooltip>

          <IconButton
            variant="text"
            color="blue-gray"
            className="grid"
            onClick={() => setOpenSidenav(dispatch, !openSidenav)}
          >
            <Bars3Icon strokeWidth={3} className="h-6 w-6 text-blue-gray-500" />
          </IconButton>

          <IconButton
            variant="text"
            color="blue-gray"
            onClick={() => setOpenConfigurator(dispatch, true)}
          >
            <Cog6ToothIcon className="h-5 w-5 text-blue-gray-500" />
          </IconButton>
        </div>
      </div>
    </Navbar>
  );
}

SerialNavbar.displayName = "/src/widgets/layout/serial-navbar.jsx";

export default SerialNavbar;
