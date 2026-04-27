export interface Skill {
    name: string;
    description: string;
    execute(input: any): Promise<any>;
}

export class SkillManager {
    private skills: Map<string, Skill>;

    constructor() {
        this.skills = new Map<string, Skill>();
    }

    registerSkill(skill: Skill): void {
        this.skills.set(skill.name, skill);
    }

    getSkill(name: string): Skill | undefined {
        return this.skills.get(name);
    }

    listSkills(): string[] {
        return Array.from(this.skills.keys());
    }
}
