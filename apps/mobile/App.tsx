import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, Text, View } from 'react-native';

// iOS simulator can reach the Mac via "localhost". Android emulator needs
// 10.0.2.2, and a physical device needs the Mac's LAN IP — see apps/mobile/README.md.
const API_BASE_URL = Platform.select({
  android: 'http://10.0.2.2:4000/api',
  default: 'http://localhost:4000/api',
});

type ConnectionState = 'checking' | 'online' | 'offline';

export default function App() {
  const [state, setState] = useState<ConnectionState>('checking');
  const [mongo, setMongo] = useState<string>('—');

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE_URL}/health`)
      .then((res) => {
        if (!res.ok) throw new Error('Health check failed');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setMongo(data.mongo ?? 'unknown');
        setState('online');
      })
      .catch(() => {
        if (!cancelled) setState('offline');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>M</Text>
      </View>
      <Text style={styles.title}>Medicore Mobile</Text>
      <Text style={styles.subtitle}>
        Cross-platform foundation — Android &amp; iOS, backed by the same Medicore API.
      </Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>API connection</Text>
          <Text style={[styles.rowValue, state === 'online' ? styles.online : state === 'offline' ? styles.offline : styles.checking]}>
            {state === 'checking' ? 'Checking…' : state === 'online' ? 'Connected' : 'Offline'}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Database</Text>
          <Text style={styles.rowValue}>{mongo}</Text>
        </View>
      </View>

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fbfbfd',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#3d4f9e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logoText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#171923',
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    maxWidth: 280,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: 'white',
    padding: 16,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#171923',
  },
  online: {
    color: '#15803d',
  },
  offline: {
    color: '#dc2626',
  },
  checking: {
    color: '#6b7280',
  },
});
