import React, { useCallback, useEffect, useState } from 'react';
import { employeesApi } from '../services/employees-api';
import type { EmployeeResponse, MembershipRole } from '@pulso/contracts';

export const EmployeesScreen: React.FC<{ locationId: string }> = ({ locationId }) => {
  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
  const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [role, setRole] = useState<MembershipRole>('CASHIER');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null); const [confirmation, setConfirmation] = useState<string | null>(null);
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null); const [copied, setCopied] = useState(false);
  const load = useCallback(async () => { setLoading(true); try { setEmployees(await employeesApi.list()); setError(null); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cargar empleados'); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const invite = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); try { const result = await employeesApi.invite({ email, name, role, locationIds: role === 'OWNER' ? [] : [locationId] }); setInvitationUrl(result.action.url); setCopied(false); setEmail(''); setName(''); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar invitación'); } finally { setBusy(false); } };
  const cancelInvitation = async (employee: EmployeeResponse) => {
    if (!window.confirm(`¿Cancelar la invitación de ${employee.name}?`)) return;
    setActionId(employee.id); setError(null); setConfirmation(null);
    try { await employeesApi.cancel(employee.id, { version: employee.version }); setConfirmation(`Invitación de ${employee.name} cancelada.`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cancelar la invitación'); }
    finally { setActionId(null); }
  };
  const changeStatus = async (employee: EmployeeResponse, status: 'ACTIVE' | 'DISABLED') => {
    if (status === 'DISABLED' && !window.confirm(`¿Eliminar el acceso de ${employee.name}? Podrás reactivarlo más adelante.`)) return;
    setActionId(employee.id); setError(null); setConfirmation(null);
    try {
      await employeesApi.update(employee.id, { role: employee.role, status, locationIds: employee.locationIds, version: employee.version });
      setConfirmation(status === 'ACTIVE' ? `${employee.name} fue reactivado.` : `${employee.name} fue eliminado del equipo activo.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo actualizar el empleado'); }
    finally { setActionId(null); }
  };
  const removeDisabledEmployee = async (employee: EmployeeResponse) => {
    if (!window.confirm(`¿Eliminar definitivamente a ${employee.name}? Esta acción revoca su acceso.`)) return;
    setActionId(employee.id); setError(null); setConfirmation(null);
    try { await employeesApi.cancel(employee.id, { version: employee.version }); setConfirmation(`${employee.name} fue eliminado definitivamente.`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo eliminar el empleado'); }
    finally { setActionId(null); }
  };
  const statusLabels: Record<EmployeeResponse['status'], string> = { ACTIVE: 'Activo', DISABLED: 'Deshabilitado', INVITED: 'Invitado' };
  const roleLabels: Record<MembershipRole, string> = { OWNER: 'Propietario', MANAGER: 'Encargado', CASHIER: 'Cajero' };
  return <section className="employees-screen" style={{ padding: '28px 32px 48px', maxWidth: 1200, margin: '0 auto', fontFamily: 'var(--font-sans)' }}>
    <header style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:20, paddingBottom:18, borderBottom:'2px solid var(--color-border-bold)', marginBottom:22 }}><div><div style={{ color:'var(--color-accent)', fontWeight:800, letterSpacing:2, fontSize:12 }}>ADMINISTRACIÓN / EQUIPO</div><h1 style={{ margin:'5px 0 2px', fontFamily:'var(--font-display)', fontSize:34, letterSpacing:-.5 }}>Empleados</h1><p style={{ margin:0, color:'var(--color-muted)' }}>Invitaciones, roles y accesos del equipo.</p></div><button className="pulso-button pulso-button--secondary pulso-button--sm" type="button" onClick={() => void load()}>Actualizar</button></header>
    <form className="pulso-panel" onSubmit={invite} style={{ display:'flex', gap:10, flexWrap:'wrap', padding:18, marginBottom:22, borderColor:'var(--color-border-bold)' }}><input className="pulso-input" required minLength={2} placeholder="Nombre" aria-label="Nombre" value={name} onChange={e=>setName(e.target.value)} /><input className="pulso-input" required type="email" placeholder="Email" aria-label="Email" value={email} onChange={e=>setEmail(e.target.value)} /><select className="pulso-select" aria-label="Rol" value={role} onChange={e=>setRole(e.target.value as MembershipRole)}><option value="CASHIER">Cajero</option><option value="MANAGER">Encargado</option><option value="OWNER">Propietario</option></select><button className="pulso-button pulso-button--primary pulso-button--sm" disabled={busy} type="submit">{busy?'Enviando…':'Invitar empleado'}</button></form>
    {invitationUrl && <aside className="pulso-panel" role="status" style={{ padding:18, marginBottom:22, borderColor:'var(--color-accent)' }}><strong>Invitación lista</strong><p>Compartí este enlace con el empleado. El token solo viaja en el fragmento seguro del enlace.</p><input className="pulso-input" readOnly value={copied ? 'Enlace copiado (token oculto)' : invitationUrl} aria-label="Enlace de invitación" /><button className="pulso-button pulso-button--secondary pulso-button--sm" type="button" onClick={async()=>{ await navigator.clipboard.writeText(invitationUrl); setCopied(true); }}> {copied?'Copiado':'Copiar enlace'} </button></aside>}
    {error && <p role="alert" style={{ color:'var(--color-danger)' }}>{error}</p>}
    {confirmation && <p role="status" style={{ color:'var(--color-accent)', fontWeight:700 }}>{confirmation}</p>}
    {loading ? <p>Cargando equipo…</p> : <div className="pulso-panel" style={{ overflowX:'auto', padding:0, borderColor:'var(--color-border-bold)' }}><table style={{ width:'100%', borderCollapse:'collapse' }}><thead><tr style={{ background:'var(--color-surface-sunken)', borderBottom:'2px solid var(--color-border-bold)' }}><th align="left">Nombre</th><th align="left">Email</th><th align="left">Rol</th><th align="left">Estado</th><th align="left">Sucursales</th><th align="left">Acciones</th></tr></thead><tbody>{employees.map(employee => <tr key={employee.id} style={{ borderBottom:'1px solid var(--color-border)' }}><td>{employee.name}</td><td>{employee.email}</td><td>{roleLabels[employee.role]}</td><td>{statusLabels[employee.status]}</td><td>{employee.locationIds.length || 'Todas'}</td><td>{employee.status === 'INVITED' ? <button aria-label={`Cancelar invitación de ${employee.name}`} className="pulso-button pulso-button--secondary pulso-button--sm" type="button" disabled={actionId === employee.id} onClick={() => void cancelInvitation(employee)}>{actionId === employee.id ? 'Cancelando…' : 'Cancelar invitación'}</button> : employee.status === 'DISABLED' ? <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}><button aria-label={`Reactivar a ${employee.name}`} className="pulso-button pulso-button--secondary pulso-button--sm" type="button" disabled={actionId === employee.id} onClick={() => void changeStatus(employee, 'ACTIVE')}>{actionId === employee.id ? 'Reactivando…' : 'Reactivar'}</button><button aria-label={`Eliminar definitivamente a ${employee.name}`} className="pulso-button pulso-button--secondary pulso-button--sm" type="button" disabled={actionId === employee.id} onClick={() => void removeDisabledEmployee(employee)}>Eliminar definitivamente</button></div> : <button aria-label={`Eliminar a ${employee.name}`} className="pulso-button pulso-button--secondary pulso-button--sm" type="button" disabled={actionId === employee.id} onClick={() => void changeStatus(employee, 'DISABLED')}>{actionId === employee.id ? 'Eliminando…' : 'Eliminar'}</button>}</td></tr>)}</tbody></table></div>}
  </section>;
};
