'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Lock, RefreshCw, Trash2, Eye, Code, CheckCircle2, XCircle, MessageSquareWarning, ArrowRight } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster, toast } from 'sonner';

interface BankTemplate {
    id: string;
    bankName: string;
    accountType: string;
    patterns: string;
    columnMapping: string;
    timesUsed: number;
    successRate: number;
    updatedAt: string;
}

interface FeedbackReport {
    id: string;
    fileName: string;
    issueDescription: string;
    status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
    createdAt: string;
}

export default function AdminDashboard() {
    const [adminKey, setAdminKey] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // Data State
    const [templates, setTemplates] = useState<BankTemplate[]>([]);
    const [reports, setReports] = useState<FeedbackReport[]>([]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Dialogs
    const [selectedTemplate, setSelectedTemplate] = useState<BankTemplate | null>(null);
    const [showJsonDialog, setShowJsonDialog] = useState(false);

    const [selectedReport, setSelectedReport] = useState<FeedbackReport | null>(null);
    const [showReportDialog, setShowReportDialog] = useState(false);
    const [analyzingReport, setAnalyzingReport] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<any>(null);

    // Check storage for key on mount
    useEffect(() => {
        const storedKey = localStorage.getItem('admin_key');
        if (storedKey) {
            setAdminKey(storedKey);
            loadData(storedKey);
        }
    }, []);

    const handleLogin = async () => {
        if (!adminKey.trim()) return;
        localStorage.setItem('admin_key', adminKey);
        await loadData(adminKey);
    };

    const handleLogout = () => {
        localStorage.removeItem('admin_key');
        setAdminKey('');
        setIsAuthenticated(false);
        setTemplates([]);
        setReports([]);
    };

    const loadData = async (key: string) => {
        setLoading(true);
        setError(null);
        try {
            // Parallel fetch
            const [tplRes, rptRes] = await Promise.all([
                fetch('/api/admin/templates', { headers: { 'x-admin-key': key } }),
                fetch('/api/admin/feedback', { headers: { 'Authorization': `Bearer ${key}` } })
            ]);

            if (tplRes.status === 401 || rptRes.status === 401) {
                setIsAuthenticated(false);
                setError('Invalid Admin Key');
                return;
            }

            const tplData = await tplRes.json();
            const rptData = await rptRes.json();

            if (tplData.success) setTemplates(tplData.templates);
            if (rptData.success) setReports(rptData.reports);

            setIsAuthenticated(true);
        } catch (err) {
            setError('Connection error');
        } finally {
            setLoading(false);
        }
    };

    // --- Template Actions ---
    const handleDeleteTemplate = async (id: string) => {
        if (!confirm('Delete this template?')) return;
        try {
            const res = await fetch(`/api/admin/templates?id=${id}`, {
                method: 'DELETE',
                headers: { 'x-admin-key': adminKey }
            });
            if ((await res.json()).success) {
                setTemplates(prev => prev.filter(t => t.id !== id));
                toast.success('Template deleted');
            }
        } catch { }
    };

    // --- Feedback Actions ---
    const analyzeReport = async () => {
        if (!selectedReport) return;
        setAnalyzingReport(true);
        setAnalysisResult(null);
        try {
            const res = await fetch('/api/admin/feedback', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'analyze', reportId: selectedReport.id })
            });
            const data = await res.json();
            if (data.success) {
                setAnalysisResult(data.result);
                toast.success('Analysis complete');
            } else {
                toast.error(data.error || 'Analysis failed');
            }
        } catch (err) {
            toast.error('Network error');
        } finally {
            setAnalyzingReport(false);
        }
    };

    const resolveReport = async () => {
        if (!selectedReport || !analysisResult) return;
        try {
            const res = await fetch('/api/admin/feedback', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'resolve',
                    reportId: selectedReport.id,
                    extractionResult: analysisResult
                })
            });
            if ((await res.json()).success) {
                toast.success('Template updated & Report resolved');
                setReports(prev => prev.map(r => r.id === selectedReport.id ? { ...r, status: 'RESOLVED' } : r));
                setShowReportDialog(false);
                loadData(adminKey); // Refresh templates
            }
        } catch { }
    };

    const dismissReport = async () => {
        if (!selectedReport) return;
        if (!confirm('Dismiss and delete this report?')) return;
        try {
            const res = await fetch('/api/admin/feedback', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${adminKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'dismiss', reportId: selectedReport.id })
            });
            if ((await res.json()).success) {
                setReports(prev => prev.filter(r => r.id !== selectedReport.id));
                setShowReportDialog(false);
                toast.success('Report dismissed');
            }
        } catch { }
    };


    const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString([], { hour: '2-digit', minute: '2-digit' });
    const parseJsonSafe = (jsonString: string) => { try { return JSON.parse(jsonString); } catch { return { error: 'Invalid JSON' }; } };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Lock className="w-5 h-5" /> Admin Access</CardTitle>
                        <CardDescription>Enter admin key to manage system</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {error && <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
                        <Input type="password" placeholder="Admin Key" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
                        <Button className="w-full" onClick={handleLogin} disabled={loading}>{loading ? 'Verifying...' : 'Login'}</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-6">
            <Toaster position="top-right" />
            <div className="max-w-6xl mx-auto space-y-6">
                <div className="flex items-center justify-between">
                    <div><h1 className="text-2xl font-bold">Admin Dashboard</h1><p className="text-muted-foreground">Manage Templates & Feedback</p></div>
                    <div className="flex gap-2"><Button variant="outline" onClick={() => loadData(adminKey)}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button><Button variant="ghost" onClick={handleLogout}>Logout</Button></div>
                </div>

                <Tabs defaultValue="feedback">
                    <TabsList>
                        <TabsTrigger value="feedback">Feedback Queue {reports.filter(r => r.status === 'PENDING').length > 0 && <Badge className="ml-2 bg-red-500">{reports.filter(r => r.status === 'PENDING').length}</Badge>}</TabsTrigger>
                        <TabsTrigger value="templates">Template Registry ({templates.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="feedback">
                        <Card>
                            <CardHeader><CardTitle>User Feedback Reports</CardTitle><CardDescription>Review reported issues and update templates using AI.</CardDescription></CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader><TableRow><TableHead>File</TableHead><TableHead>Issue Reported</TableHead><TableHead>Status</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {reports.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No pending feedback reports.</TableCell></TableRow> :
                                            reports.map(report => (
                                                <TableRow key={report.id}>
                                                    <TableCell className="font-medium">{report.fileName}</TableCell>
                                                    <TableCell className="max-w-md truncate" title={report.issueDescription}>{report.issueDescription}</TableCell>
                                                    <TableCell><Badge variant={report.status === 'PENDING' ? 'destructive' : 'secondary'}>{report.status}</Badge></TableCell>
                                                    <TableCell>{formatDate(report.createdAt)}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button size="sm" onClick={() => { setSelectedReport(report); setShowReportDialog(true); setAnalysisResult(null); }}>Review</Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="templates">
                        <Card>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader><TableRow><TableHead>Bank Name</TableHead><TableHead>Account Type</TableHead><TableHead>Stats</TableHead><TableHead>Last Updated</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {templates.map((template) => (
                                            <TableRow key={template.id}>
                                                <TableCell className="font-medium">{template.bankName}</TableCell>
                                                <TableCell>{template.accountType}</TableCell>
                                                <TableCell><div className="flex flex-col text-xs gap-1"><Badge variant="secondary" className="w-fit">Used: {template.timesUsed}x</Badge><span className={template.successRate > 0.8 ? "text-green-600" : "text-yellow-600"}>Success: {(template.successRate * 100).toFixed(0)}%</span></div></TableCell>
                                                <TableCell className="text-sm text-muted-foreground">{formatDate(template.updatedAt)}</TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <Button variant="outline" size="sm" onClick={() => { setSelectedTemplate(template); setShowJsonDialog(true); }}><Code className="w-4 h-4" /></Button>
                                                        <Button variant="destructive" size="sm" onClick={() => handleDeleteTemplate(template.id)}><Trash2 className="w-4 h-4" /></Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Template Details Dialog */}
            <Dialog open={showJsonDialog} onOpenChange={setShowJsonDialog}>
                <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                    <DialogHeader><DialogTitle>{selectedTemplate?.bankName} Patterns</DialogTitle></DialogHeader>
                    <ScrollArea className="flex-1 p-4 border rounded-md bg-slate-950 text-slate-50 font-mono text-sm">
                        <pre>{selectedTemplate && JSON.stringify({ patterns: parseJsonSafe(selectedTemplate.patterns), columnMapping: parseJsonSafe(selectedTemplate.columnMapping) }, null, 2)}</pre>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* Report Review Dialog */}
            <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
                <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Review Feedback: {selectedReport?.fileName}</DialogTitle>
                        <DialogDescription className="text-red-600 font-medium bg-red-50 p-2 rounded mt-2 border border-red-100">
                            User Report: "{selectedReport?.issueDescription}"
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                        {!analysisResult ? (
                            <div className="flex-1 flex items-center justify-center border-2 border-dashed rounded-lg bg-gray-50 min-h-[200px]">
                                {analyzingReport ? (
                                    <div className="text-center"><RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-2" /><p>Analyzing with Gemini AI (incorporating user feedback)...</p></div>
                                ) : (
                                    <div className="text-center"><p className="text-muted-foreground mb-4">Click below to analyze the document with AI.</p><Button onClick={analyzeReport}>Run AI Analysis (Cost Applied)</Button></div>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col gap-2 overflow-hidden">
                                <h3 className="font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" /> AI Proposal</h3>
                                <div className="grid grid-cols-2 gap-4 text-sm mb-2">
                                    <div className="p-2 bg-slate-100 rounded"><strong>Bank:</strong> {analysisResult.statement.bankName}</div>
                                    <div className="p-2 bg-slate-100 rounded"><strong>Transactions:</strong> {analysisResult.statement.transactions.length} found</div>
                                </div>
                                <ScrollArea className="flex-1 border rounded bg-slate-950 text-green-400 p-4 font-mono text-xs">
                                    <pre>{JSON.stringify(analysisResult.patterns, null, 2)}</pre>
                                </ScrollArea>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="gap-2 sm:justify-between">
                        <Button variant="outline" onClick={dismissReport} className="text-red-600 hover:text-red-700 hover:bg-red-50">Dismiss Report</Button>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setShowReportDialog(false)}>Cancel</Button>
                            <Button onClick={resolveReport} disabled={!analysisResult}>Apply Template Fix</Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
