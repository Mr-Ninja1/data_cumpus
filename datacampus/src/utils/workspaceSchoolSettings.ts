import { supabaseServer } from '@/utils/supabaseServerClient';
import { SCHOOL_PROFILE } from '@/utils/schoolProfile';

export type WorkspaceSchoolSettings = {
  school_name: string;
  school_short_name: string;
  default_program: string | null;
  default_proposal_spec_key: string | null;
  logo_path: string | null;
  metadata: Record<string, unknown>;
};

export const DEFAULT_WORKSPACE_SCHOOL_SETTINGS: WorkspaceSchoolSettings = {
  school_name: SCHOOL_PROFILE.name,
  school_short_name: SCHOOL_PROFILE.shortName,
  default_program: SCHOOL_PROFILE.defaultProgram,
  default_proposal_spec_key: 'zut-it-final-year-proposal',
  logo_path: null,
  metadata: {},
};

export async function loadWorkspaceSchoolSettings(): Promise<WorkspaceSchoolSettings> {
  if (!supabaseServer) return DEFAULT_WORKSPACE_SCHOOL_SETTINGS;

  const { data } = await supabaseServer
    .from('workspace_school_settings')
    .select('school_name,school_short_name,default_program,default_proposal_spec_key,logo_path,metadata')
    .eq('id', 'default')
    .maybeSingle();

  if (!data) return DEFAULT_WORKSPACE_SCHOOL_SETTINGS;

  return {
    school_name: data.school_name || DEFAULT_WORKSPACE_SCHOOL_SETTINGS.school_name,
    school_short_name: data.school_short_name || DEFAULT_WORKSPACE_SCHOOL_SETTINGS.school_short_name,
    default_program: data.default_program ?? DEFAULT_WORKSPACE_SCHOOL_SETTINGS.default_program,
    default_proposal_spec_key:
      data.default_proposal_spec_key ?? DEFAULT_WORKSPACE_SCHOOL_SETTINGS.default_proposal_spec_key,
    logo_path: data.logo_path ?? null,
    metadata: (data.metadata as Record<string, unknown> | null) || {},
  };
}
