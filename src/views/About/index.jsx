import { memo, useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftOutlined, GithubOutlined, MailOutlined, TeamOutlined, CrownOutlined, StarFilled } from '@ant-design/icons'
import { Tooltip } from 'antd'
import themeConfig from '#theme'
import style from './index.module.less'

/**
 * ============================================================
 *  项目负责人
 * ============================================================
 */
const LEADER = {
  name: '待补充',
  title: '项目负责人 / 架构师',
  bio: '统筹项目整体规划与技术架构设计，主导核心模块开发，协调团队协作与进度管理。拥有多年全栈开发经验，致力于打造优雅、高效的知识管理平台。',
  skills: ['React', 'Spring Boot', '系统架构', '团队管理', 'MySQL', 'Docker'],
}

/**
 * ============================================================
 *  核心团队成员
 * ============================================================
 */
const TEAM_MEMBERS = [
  {
    name: '待补充',
    role: '前端开发',
    bio: '负责前端页面开发、组件库搭建与交互动效实现。',
    skills: ['React', 'Ant Design', 'Vite'],
  },
  {
    name: '待补充',
    role: '后端开发',
    bio: '负责后端 API 开发、数据库设计与权限系统实现。',
    skills: ['Spring Boot', 'MySQL', 'Redis'],
  },
  {
    name: '待补充',
    role: 'UI/UX 设计',
    bio: '负责系统视觉设计、交互原型与品牌规范制定。',
    skills: ['Figma', '设计系统', '动效'],
  },
  {
    name: '待补充',
    role: '前端开发',
    bio: '参与前端组件开发、Excel 编辑器集成与性能优化。',
    skills: ['React', 'Univer', 'Canvas'],
  },
  {
    name: '待补充',
    role: '测试 & 文档',
    bio: '负责系统测试用例编写、联调验收与技术文档维护。',
    skills: ['测试', '文档', '联调'],
  },
]

const MEMBER_COLORS = [
  { bg: 'linear-gradient(135deg, #c49a3e, #9a6d2b)' },
  { bg: 'linear-gradient(135deg, #b8945a, #8b6b3c)' },
  { bg: 'linear-gradient(135deg, #a8885a, #7a6038)' },
  { bg: 'linear-gradient(135deg, #c9a860, #a07d3a)' },
  { bg: 'linear-gradient(135deg, #ba9850, #8b6d30)' },
  { bg: 'linear-gradient(135deg, #d0b870, #b09040)' },
  { bg: 'linear-gradient(135deg, #c8a855, #957228)' },
]

const getInitials = (name) => {
  if (!name || name === '待补充') return '?'
  return name.slice(-2)
}

/* ============================================================
   滚动揭示 Hook
   使用 IntersectionObserver，元素进入视口时触发动画
   ============================================================ */
const useScrollReveal = (threshold = 0.15) => {
  const [refsMap] = useState(() => new Map())
  const [visibleSet, setVisibleSet] = useState(() => new Set())
  const observerRef = useRef(null)

  const setRef = useCallback((key, node) => {
    if (!node) {
      refsMap.delete(key)
      return
    }
    refsMap.set(key, node)
    // 如果已经标记过 visible，立即应用
    if (visibleSet.has(key) && node) {
      node.classList.add(style.revealed)
    }
    // 让 observer 重新观察所有节点
    if (observerRef.current) {
      observerRef.current.disconnect()
      const obs = observerRef.current
      refsMap.forEach((el, k) => {
        if (!visibleSet.has(k)) obs.observe(el)
      })
    }
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const newlyVisible = []
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const key = entry.target.getAttribute('data-reveal-key')
            if (key) {
              entry.target.classList.add(style.revealed)
              newlyVisible.push(key)
              observer.unobserve(entry.target)
            }
          }
        })
        if (newlyVisible.length > 0) {
          setVisibleSet((prev) => {
            const next = new Set(prev)
            newlyVisible.forEach((k) => next.add(k))
            return next
          })
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    )
    observerRef.current = observer

    // 初次连接所有已有节点
    const timer = setTimeout(() => {
      refsMap.forEach((el, key) => {
        if (!visibleSet.has(key)) observer.observe(el)
      })
    }, 100)

    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [threshold])

  return setRef
}

/* ---- Reveal 包装组件 ---- */
const Reveal = ({ children, setRef, revealKey, delay = 0, className = '' }) => (
  <div
    ref={(node) => setRef(revealKey, node)}
    data-reveal-key={revealKey}
    className={`${style.reveal} ${className}`}
    style={{ transitionDelay: `${delay}s` }}
  >
    {children}
  </div>
)

/* ---- 团队成员卡片 ---- */
const MemberCard = ({ member, index, setRef }) => {
  const colorCfg = MEMBER_COLORS[index % MEMBER_COLORS.length]
  return (
    <Reveal setRef={setRef} revealKey={`member-${index}`} delay={index * 0.07}>
      <div className={style.card}>
        <div className={style.avatarWrap}>
          <div className={style.avatarRing}>
            <div className={style.avatar} style={{ background: colorCfg.bg }}>
              <span>{getInitials(member.name)}</span>
            </div>
          </div>
        </div>
        <div className={style.cardBody}>
          <h3 className={style.memberName}>{member.name}</h3>
          <span className={style.memberRole}>{member.role}</span>
          <p className={style.memberBio}>{member.bio}</p>
          <div className={style.skills}>
            {member.skills.map((skill, i) => (
              <span key={i} className={style.skillTag}>{skill}</span>
            ))}
          </div>
        </div>
        <div className={style.cardGlow} />
      </div>
    </Reveal>
  )
}

const About = () => {
  const navigate = useNavigate()
  const setRef = useScrollReveal(0.12)
  const totalMembers = TEAM_MEMBERS.length + 1

  return (
    <div className={style.page}>
      {/* ---- 装饰背景 ---- */}
      <div className={style.bgDecor}>
        <div className={style.bgOrb1} />
        <div className={style.bgOrb2} />
        <div className={style.bgOrb3} />
        <div className={style.bgGrid} />
      </div>

      {/* ---- 主内容 ---- */}
      <div className={style.container}>
        <Reveal setRef={setRef} revealKey="backBtn" delay={0}>
          <button className={style.backBtn} onClick={() => navigate('/login')}>
            <ArrowLeftOutlined />
            <span>返回登录</span>
          </button>
        </Reveal>

        {/* 标题区 */}
        <Reveal setRef={setRef} revealKey="header" delay={0.05}>
          <header className={style.header}>
            <div className={style.headerBadge}>
              <TeamOutlined />
              <span>关于我们</span>
            </div>
            <h1 className={style.title}>{themeConfig.brand.name}</h1>
            <div className={style.titleDivider} />
            <p className={style.subtitle}>
              本项目由 <strong>信管工作室</strong> 设计并开发，致力于为学术团队提供优雅、高效的知识管理体验。
            </p>
          </header>
        </Reveal>

        {/* 统计概要 */}
        <Reveal setRef={setRef} revealKey="stats" delay={0.1}>
          <div className={style.stats}>
            <div className={style.statItem}>
              <span className={style.statNum}>{totalMembers}</span>
              <span className={style.statLabel}>核心成员</span>
            </div>
            <div className={style.statDot} />
            <div className={style.statItem}>
              <span className={style.statNum}>
                {new Set(TEAM_MEMBERS.map(m => m.role)).size + 1}
              </span>
              <span className={style.statLabel}>职能角色</span>
            </div>
            <div className={style.statDot} />
            <div className={style.statItem}>
              <span className={style.statNum}>2025–2026</span>
              <span className={style.statLabel}>开发周期</span>
            </div>
          </div>
        </Reveal>

        {/* ============================================================
            项目负责人
            ============================================================ */}
        <Reveal setRef={setRef} revealKey="leaderLabel" delay={0.15}>
          <div className={style.leaderLabel}>
            <CrownOutlined />
            <span>项目负责人</span>
            <StarFilled className={style.leaderStar} />
          </div>
        </Reveal>

        <Reveal setRef={setRef} revealKey="leaderCard" delay={0.2}>
          <div className={style.leaderCard}>
            <div className={style.leaderAvatarCol}>
              <div className={style.leaderAvatarRing}>
                <div className={style.leaderAvatar}>
                  <span>{getInitials(LEADER.name)}</span>
                </div>
              </div>
              <div className={style.leaderAvatarGlow} />
            </div>
            <div className={style.leaderInfoCol}>
              <div className={style.leaderNameRow}>
                <h2 className={style.leaderName}>{LEADER.name}</h2>
                <div className={style.leaderCrown}>
                  <CrownOutlined />
                </div>
              </div>
              <span className={style.leaderTitle}>{LEADER.title}</span>
              <div className={style.leaderDivider} />
              <p className={style.leaderBio}>{LEADER.bio}</p>
              <div className={style.leaderSkills}>
                {LEADER.skills.map((skill, i) => (
                  <span key={i} className={style.leaderSkillTag}>{skill}</span>
                ))}
              </div>
            </div>
            <div className={style.leaderCardLine} />
            <div className={style.leaderCardCorner1} />
            <div className={style.leaderCardCorner2} />
          </div>
        </Reveal>

        {/* ============================================================
            核心团队
            ============================================================ */}
        <Reveal setRef={setRef} revealKey="teamHeader" delay={0.25}>
          <div className={style.teamSectionHeader}>
            <div className={style.teamSectionLine} />
            <span className={style.teamSectionLabel}>
              <TeamOutlined />
              核心团队
            </span>
            <div className={style.teamSectionLine} />
          </div>
        </Reveal>

        <div className={style.grid}>
          {TEAM_MEMBERS.map((member, idx) => (
            <MemberCard key={idx} member={member} index={idx} setRef={setRef} />
          ))}
        </div>

        {/* 页脚 */}
        <Reveal setRef={setRef} revealKey="footer" delay={0.3}>
          <footer className={style.footer}>
            <div className={style.footerDivider} />
            <p className={style.footerText}>
              {themeConfig.brand.name} · {themeConfig.brand.subtitle}
            </p>
            <div className={style.footerLinks}>
              <Tooltip title="联系我们">
                <span className={style.footerIcon}><MailOutlined /></span>
              </Tooltip>
              <Tooltip title="GitHub">
                <span className={style.footerIcon}><GithubOutlined /></span>
              </Tooltip>
            </div>
          </footer>
        </Reveal>
      </div>
    </div>
  )
}

export const MemoAbout = memo(About)
