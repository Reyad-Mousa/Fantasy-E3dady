import { useRef, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';

interface HomeStageStatsChartProps {
    animationsEnabled: boolean;
    isMobile: boolean;
    prefersLowMotion: boolean;
    stageStats: any[];
    mobileChartData: any[];
}

export function HomeStageStatsChart({
    animationsEnabled,
    isMobile,
    prefersLowMotion,
    stageStats,
    mobileChartData
}: HomeStageStatsChartProps) {
    const [isMounted, setIsMounted] = useState(false);
    const mobileChartContainerRef = useRef<HTMLDivElement | null>(null);
    const [mobileChartSize, setMobileChartSize] = useState({ width: 0, height: 0 });

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (!isMounted || !isMobile) {
            setMobileChartSize({ width: 0, height: 0 });
            return;
        }

        const container = mobileChartContainerRef.current;
        if (!container) {
            setMobileChartSize({ width: 0, height: 0 });
            return;
        }

        const updateSize = () => {
            const { width, height } = container.getBoundingClientRect();
            setMobileChartSize({
                width: width > 0 ? Math.floor(width) : 0,
                height: height > 0 ? Math.floor(height) : 0,
            });
        };

        updateSize();
        const rafId = window.requestAnimationFrame(updateSize);
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(container);

        return () => {
            window.cancelAnimationFrame(rafId);
            resizeObserver.disconnect();
        };
    }, [isMounted, isMobile]);

    return (
        <motion.div
            initial={animationsEnabled ? { opacity: 0, y: 20 } : false}
            animate={animationsEnabled ? { opacity: 1, y: 0 } : undefined}
            transition={animationsEnabled ? { delay: 0.1 } : undefined}
            className="lg:col-span-8 bg-surface-card rounded-3xl p-6 sm:p-8 border border-white/5 shadow-xl flex flex-col"
        >
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="bg-primary/20 p-2.5 rounded-xl border border-primary/30">
                        <BarChart3 className="w-5 h-5 text-primary-light" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-white">تحليل نقاط المراحل</h2>
                        <p className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">نسبة النقاط التراكمية</p>
                    </div>
                </div>

            </div>

            {isMobile ? (
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3">
                    <div
                        ref={mobileChartContainerRef}
                        className="h-[240px] w-full"
                        style={{ minWidth: 10, minHeight: 240 }}
                        dir="ltr"
                    >
                        {isMounted && mobileChartSize.width > 0 && mobileChartSize.height > 0 && (
                            <BarChart
                                width={mobileChartSize.width}
                                height={mobileChartSize.height}
                                data={mobileChartData}
                                margin={{ top: 8, bottom: 2 }}
                            >
                                <XAxis
                                    dataKey="shortName"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 'bold' }}
                                    dy={8}
                                />
                                <YAxis hide />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                    formatter={(value: any, _name, payload: any) => [
                                        `${Number(value) || 0} نقطة`,
                                        `${payload?.payload?.name ?? 'المرحلة'}`,
                                    ]}
                                    contentStyle={{
                                        backgroundColor: '#1e1b4b',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                                        fontSize: '12px',
                                    }}
                                    itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                                />
                                <Bar
                                    dataKey="points"
                                    radius={[10, 10, 0, 0]}
                                    barSize={32}
                                    isAnimationActive={!prefersLowMotion}
                                >
                                    {mobileChartData.map((entry, index) => (
                                        <Cell key={`mobile-cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        )}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/5 pt-3" dir="ltr">
                        {mobileChartData.map((stage, i) => (
                            <div key={i} className="text-center">
                                <div className="text-[10px] font-black text-text-secondary uppercase">{stage.shortName}</div>
                                <div className="text-sm font-black" style={{ color: stage.color, filter: 'brightness(1.15)' }}>{stage.points}</div>
                                <div className="text-[10px] text-text-secondary">{stage.count} فرق</div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    <div className="h-[280px] sm:h-[350px] w-full" dir="ltr">
                        {isMounted && (
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={1}>
                                <BarChart data={stageStats} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                    <XAxis
                                        dataKey="name"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 'bold' }}
                                        dy={10}
                                    />
                                    <YAxis hide />
                                    <Tooltip
                                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                        contentStyle={{ backgroundColor: '#1e1b4b', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}
                                        itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                                    />
                                    <Bar
                                        dataKey="points"
                                        radius={[12, 12, 0, 0]}
                                        barSize={isMobile ? 28 : 60}
                                        isAnimationActive={!prefersLowMotion}
                                    >
                                        {stageStats.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* Stage Legend for Desktop */}
                    <div className="mt-8 grid grid-cols-3 gap-3 border-t border-white/5 pt-6" dir="ltr">
                        {stageStats.map((s, i) => (
                            <div key={i} className="text-center group cursor-default">
                                <div className="text-[10px] font-black text-text-secondary mb-1 group-hover:text-white transition-colors uppercase">{s.name.split(' ')[0]}</div>
                                <div className="text-lg font-black transition-all group-hover:scale-110" style={{ color: s.color, filter: 'brightness(1.15)' }}>{s.points}</div>
                                <div className="text-[12px] text-text-secondary mt-0.5">{s.count} فرق</div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </motion.div>
    );
}
