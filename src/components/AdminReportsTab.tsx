import { motion } from 'motion/react';
import { FileSpreadsheet, RefreshCw, Trash2, Download } from 'lucide-react';

interface ReportsTabProps {
    scores: any[];
    recalculating: boolean;
    clearingLogs: boolean;
    handleExportExcel: () => void;
    setShowRecalculateConfirm: (show: boolean) => void;
    setShowClearLogsConfirm: (show: boolean) => void;
}

export default function AdminReportsTab({
    scores,
    recalculating,
    clearingLogs,
    handleExportExcel,
    setShowRecalculateConfirm,
    setShowClearLogsConfirm
}: ReportsTabProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
        >
            <div className="glass-card p-6">
                <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-success" />
                    تصدير التقارير
                </h3>
                <p className="text-text-secondary text-sm mb-4">
                    صدّر بيانات المسابقة كملف Excel يحتوي على ترتيب الفرق وسجل النقاط
                </p>
                <button onClick={handleExportExcel} className="btn btn-primary">
                    <Download className="w-4 h-4" />
                    تصدير Excel
                </button>
            </div>

            <div className="glass-card p-6 border border-warning/30 bg-warning/5">
                <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-warning" />
                    إعادة حساب الإجماليات
                </h3>
                <p className="text-text-secondary text-sm mb-4">
                    استخدم هذه الميزة إذا لاحظت عدم دقة في مجموع النقاط للفرق أو الأعضاء. سيتم مسح الإجماليات الحالية وإعادة بنائها من سجلات النقاط فقط.
                </p>
                <button
                    onClick={() => setShowRecalculateConfirm(true)}
                    disabled={recalculating}
                    className="btn btn-ghost text-warning border-warning/30 hover:bg-warning/10"
                >
                    {recalculating ? <div className="spinner !w-4 !h-4" /> : <RefreshCw className="w-4 h-4" />}
                    إعادة حساب النقاط
                </button>
            </div>

            <div className="glass-card p-6 border border-danger/30 bg-danger/5">
                <h3 className="font-bold text-text-primary mb-4 flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-danger" />
                    مسح سجل النشاطات والعمليات
                </h3>
                <p className="text-text-secondary text-sm mb-4">
                    تحذير: سيتم حذف جميع سجلات "النشاطات" و "النقاط المسجلة" نهائياً، وسيتم **تصفير نقاط جميع الفرق والأفراد**. المسح سيجعل المنظومة تبدأ من الصفر (موسم جديد).
                </p>
                <button
                    onClick={() => setShowClearLogsConfirm(true)}
                    disabled={clearingLogs}
                    className="btn btn-ghost text-danger border-danger/30 hover:bg-danger/10"
                >
                    {clearingLogs ? <div className="spinner !w-4 !h-4" /> : <Trash2 className="w-4 h-4" />}
                    مسح السجل بالكامل
                </button>
            </div>

            {/* Summary Stats */}
            <div className="grid sm:grid-cols-3 gap-4">
                <div className="glass-card p-5 text-center">
                    <p className="text-3xl font-black text-accent">{scores.filter(s => s.type === 'earn').reduce((s, sc) => s + (Number(sc.points) || 0), 0)}</p>
                    <p className="text-text-secondary text-sm mt-1">إجمالي النقاط المكتسبة</p>
                </div>
                <div className="glass-card p-5 text-center">
                    <p className="text-3xl font-black text-danger">{scores.filter(s => s.type === 'deduct').reduce((s, sc) => s + (Number(sc.points) || 0), 0)}</p>
                    <p className="text-text-secondary text-sm mt-1">إجمالي النقاط المخصومة</p>
                </div>
                <div className="glass-card p-5 text-center">
                    <p className="text-3xl font-black text-primary">{scores.length}</p>
                    <p className="text-text-secondary text-sm mt-1">إجمالي التسجيلات</p>
                </div>
            </div>
        </motion.div>
    );
}
