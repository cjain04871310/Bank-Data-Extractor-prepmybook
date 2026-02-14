import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { extractPDFWithVLM } from '@/lib/extraction/vlm-extractor';
import { saveTemplate } from '@/lib/extraction/template-manager';

const ADMIN_KEY = process.env.ADMIN_KEY;

export async function GET(request: NextRequest) {
    // 1. Auth Check
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${ADMIN_KEY}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Return pending reports first
        const reports = await db.feedbackReport.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                fileName: true,
                issueDescription: true,
                status: true,
                createdAt: true,
                // Exclude pdfBase64 to save bandwidth
            }
        });
        return NextResponse.json({ success: true, reports });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Failed to fetch reports' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    // 1. Auth Check
    const authHeader = request.headers.get('Authorization');
    if (authHeader !== `Bearer ${ADMIN_KEY}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { action, reportId, extractionResult } = body;

        if (!reportId) return NextResponse.json({ error: 'Missing reportId' }, { status: 400 });

        const report = await db.feedbackReport.findUnique({ where: { id: reportId } });
        if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });

        if (action === 'analyze') {
            // Call VLM with Feedback
            try {
                const result = await extractPDFWithVLM(report.pdfBase64, report.issueDescription);
                if (!result) throw new Error('AI analysis failed');

                return NextResponse.json({ success: true, result });
            } catch (err: any) {
                return NextResponse.json({ success: false, error: err.message || 'Analysis failed' }, { status: 500 });
            }
        }

        if (action === 'resolve') {
            // Save Template & Update Status
            if (!extractionResult) return NextResponse.json({ error: 'Missing extraction data' }, { status: 400 });

            const { statement, patterns, columnMapping } = extractionResult;

            // Force update/create template for this bank
            // Note: we might need accountType if available, defaulting to 'checking' or null
            await saveTemplate(statement.bankName || 'Unknown Bank', patterns, columnMapping);

            await db.feedbackReport.update({
                where: { id: reportId },
                data: { status: 'RESOLVED', adminNotes: 'Template updated via AI Analysis' }
            });

            return NextResponse.json({ success: true });
        }

        if (action === 'dismiss') {
            // Delete or Mark Dismissed
            await db.feedbackReport.delete({ where: { id: reportId } }); // Clean up space
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        console.error('Admin feedback error:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
