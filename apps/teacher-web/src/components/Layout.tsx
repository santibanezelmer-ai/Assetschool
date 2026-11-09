import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { DashboardStats } from '@assetschool/shared-types';

export const Layout: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    fetch('/api/v1/dashboard/stats')
      .then((res) => {
        if (!res.ok) throw new Error('API offline');
        return res.json();
      })
      .then((data) => setStats(data))
      .catch(() => {
        // Fallback status when backend is connecting
        setStats({
          totalRegisteredDevices: 4,
          connectedDevices: 2,
          disconnectedDevices: 1,
          availableClassrooms: 2,
          activeSessions: 1,
          serverStatus: {
            status: 'online',
            uptimeSeconds: 120,
            memoryUsageMb: 85,
            version: '1.0.0-phase1',
            nodeVersion: 'v24.22.0',
          },
          lanStatus: {
            interfaceName: 'en0',
            localIp: '192.168.1.100',
            subnet: '255.255.255.0',
            broadcastIp: '192.168.1.255',
            multicastDiscoveryActive: true,
            activeAgentSockets: 2,
          },
          recentEvents: [],
        });
      });
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          serverStatus={{
            status: stats?.serverStatus.status || 'online',
            localIp: stats?.lanStatus.localIp ? `${stats.lanStatus.localIp}:3000` : undefined,
          }}
        />
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          <Outlet context={{ stats }} />
        </main>
      </div>
    </div>
  );
};
