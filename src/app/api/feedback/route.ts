import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { fileName, issueDescription, pdfBase64 } = body;

        // Validation
        if (!fileName || !issueDescription || !pdfBase64) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Limit size check (approximate base64 length check)
        // 5MB binary ~= 6.7MB base64
        if (pdfBase64.length > 7 * 1024 * 1024) {
            return NextResponse.json(
                { success: false, error: 'File too large for feedback report (Max 5MB)' },
                { status: 413 }
            );
        }

        // Create report
        const report = await db.feedbackReport.create({
            data: {
                fileName,
                issueDescription,
                pdfBase64,
                status: 'PENDING',
            },
        });

        return NextResponse.json({ success: true, reportId: report.id });
    } catch (error) {
        console.error('Error submitting feedback:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to submit feedback' },
            { status: 500 }
        );
    }
}
