
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
    try {
        // Basic security check (in production, use proper auth middleware)
        const authHeader = request.headers.get('x-admin-key');
        const envAdminKey = process.env.ADMIN_KEY;

        if (envAdminKey && authHeader !== envAdminKey) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const templates = await db.bankTemplate.findMany({
            orderBy: { updatedAt: 'desc' },
        });

        return NextResponse.json({ success: true, templates });
    } catch (error) {
        console.error('Error fetching templates:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch templates' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const authHeader = request.headers.get('x-admin-key');
        const envAdminKey = process.env.ADMIN_KEY;

        if (envAdminKey && authHeader !== envAdminKey) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
        }

        await db.bankTemplate.delete({
            where: { id },
        });

        return NextResponse.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        console.error('Error deleting template:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to delete template' },
            { status: 500 }
        );
    }
}
