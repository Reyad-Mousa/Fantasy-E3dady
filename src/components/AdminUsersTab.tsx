import { motion } from 'motion/react';
import { Upload } from 'lucide-react';

interface UsersTabProps {
    users: any[];
    teams: any[];
    fileInputRef: React.RefObject<HTMLInputElement>;
}

export default function AdminUsersTab({ users, teams, fileInputRef }: UsersTabProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
        >
            <div className="flex gap-3 justify-end">
                <button onClick={() => fileInputRef.current?.click()} className="btn btn-accent text-sm">
                    <Upload className="w-4 h-4" />
                    استيراد من Excel
                </button>
            </div>

            <div className="glass-card overflow-hidden">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>الاسم</th>
                            <th>البريد</th>
                            <th>الدور</th>
                            <th>الفريق</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((u) => (
                            <tr key={u.id}>
                                <td className="font-bold text-text-primary">{u.name}</td>
                                <td className="text-text-secondary">{u.email}</td>
                                <td>
                                    <span className={`badge ${u.role === 'super_admin' ? 'badge-pending' :
                                        u.role === 'admin' ? 'badge-sync' :
                                            u.role === 'leader' ? 'badge-completed' : ''
                                        }`}>
                                        {u.role === 'super_admin' ? 'مشرف عام' :
                                            u.role === 'admin' ? 'مشرف' :
                                                u.role === 'leader' ? 'قائد' : 'عضو'}
                                    </span>
                                </td>
                                <td className="text-text-secondary">
                                    {teams.find(t => t.id === u.teamId)?.name || '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </motion.div>
    );
}
