'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, ArrowRight, Layers, ShieldCheck, Zap } from 'lucide-react';

export default function ConnectionPage() {
  const router = useRouter();
  const [connectionString, setConnectionString] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectionString.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/introspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString: connectionString.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect to database');
      }

      // Save connection string and initial schema in sessionStorage
      sessionStorage.setItem('dbslate_connection', connectionString.trim());
      sessionStorage.setItem('dbslate_initial_schema', JSON.stringify(data.schema));
      sessionStorage.setItem('dbslate_db_type', data.type);

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err: any) {
      setError(
        err.message ||
          'Connection failed. Please check the path/credentials and verify the server can reach it.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const startBlankSlate = () => {
    sessionStorage.removeItem('dbslate_connection');
    sessionStorage.setItem('dbslate_initial_schema', JSON.stringify({ tables: [] }));
    sessionStorage.setItem('dbslate_db_type', 'postgres'); // Default
    router.push('/dashboard');
  };

  return (
    <div
      className="container"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '3rem',
      }}
    >
      {/* Brand Header */}
      <header style={{ textAlign: 'center', animation: 'fadeIn 0.6s ease' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1rem',
          }}
        >
          <Database size={42} className="gradient-text" style={{ color: 'var(--primary)' }} />
          <h1 style={{ fontSize: '3rem', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
            Db<span className="gradient-text">Slate</span>
          </h1>
        </div>
        <p
          style={{
            color: 'var(--text-muted)',
            fontSize: '1.25rem',
            maxWidth: '600px',
            margin: '0 auto',
            fontFamily: 'var(--font-sans)',
            fontWeight: 300,
          }}
        >
          Visual database schema introspector, model modeler, and safe DDL migration diff generator.
        </p>
      </header>

      {/* Main Connection Panel */}
      <main
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '580px',
          padding: '2.5rem',
          animation: 'fadeIn 0.8s ease',
        }}
      >
        <form
          onSubmit={handleConnect}
          style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
        >
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: 600,
              borderBottom: '1px solid var(--border)',
              paddingBottom: '0.75rem',
              fontFamily: 'var(--font-display)',
            }}
          >
            Connect to Database
          </h2>

          <div className="input-group">
            <label className="input-label" htmlFor="connection-string">
              Connection String or DB File Path
            </label>
            <input
              id="connection-string"
              type="text"
              className="input-field"
              placeholder="e.g. postgresql://user:pass@localhost:5432/mydb or c:/path/to/local.db"
              value={connectionString}
              onChange={(e) => setConnectionString(e.target.value)}
              disabled={isLoading}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
              Supports PostgreSQL URLs or local path references for SQLite databases.
            </span>
          </div>

          {error && (
            <div
              style={{
                padding: '0.75rem 1rem',
                background: 'var(--danger-glow)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.9rem',
                color: 'var(--danger)',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button
              type="submit"
              className={`btn btn-primary ${isLoading || !connectionString ? 'btn-disabled' : ''}`}
              disabled={isLoading || !connectionString}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {isLoading ? 'Introspecting Database...' : 'Connect & Introspect'}
              <ArrowRight size={18} />
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={startBlankSlate}
              disabled={isLoading}
            >
              Blank Slate
            </button>
          </div>
        </form>
      </main>

      {/* Trust & Safe Highlights */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.5rem',
          width: '100%',
          maxWidth: '850px',
          animation: 'fadeIn 1s ease',
        }}
      >
        <div
          className="glass-panel"
          style={{
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--primary)',
            }}
          >
            <ShieldCheck size={20} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Zero Data Loss</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Option B protections lock destructive migrations behind explicit confirmations.
          </p>
        </div>

        <div
          className="glass-panel"
          style={{
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--success)',
            }}
          >
            <Zap size={20} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Instant Generation</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Introspect legacy codebases in seconds and start migrations without heavy setups.
          </p>
        </div>

        <div
          className="glass-panel"
          style={{
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: 'var(--warning)',
            }}
          >
            <Layers size={20} />
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Multi-Language</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Export clean, type-safe target models in TypeScript, C#, Python, and Golang.
          </p>
        </div>
      </section>
    </div>
  );
}
